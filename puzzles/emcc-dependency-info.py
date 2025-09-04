#!/usr/bin/env python3
# Generate dependencies.json from a list of source files in the Emscripten-
# generated wasm. To use, first build with `-gsource-map` and extract the
# list of source files from the generated map files: `jq -r '.sources[]' *.map`.
# (See emcccopy.but for more details.) You may need to adjust relative paths
# and otherwise patch up the list. E.g., with the emsdk docker container:
#
#   jq -r '.sources[]' *.map \
#     | sed -E -e 's=^(\.\./)+=/=' \
#              -e's=^/emsdk/(emscripten|lib)=/emsdk/upstream/\1=' \
#     | sort -u \
#     > source-file-list.txt
#
# Then run this script to extract required notices from the source files:
#
#   python3 emcc-dependency-info.py \
#     --sources source-file-list.txt \
#     --output dependencies.json

import argparse
import json
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from os.path import commonpath
from pathlib import Path
from typing import Iterable, TypedDict

# The "LLVM Exceptions" remove the requirement to provide notice when
# the licensed software is used in compiled output. These strings recognize
# it in license text and SPDX identifiers:
LICENSE_TEXT_LLVM_EXCEPTION = "Apache License v2.0 with LLVM Exceptions"
SPDX_IDENTIFIER_LLVM_EXCEPTION = "Apache-2.0 WITH LLVM-exception"

# Source comment (prefix) whose presence indicates Emscripten license applies:
EMSCRIPTEN_NOTICE = "Emscripten is available under two separate licenses"


class Dependency(TypedDict):
    """Format of items in JSON output"""
    #: The name of the dependency (or a best guess at it)
    name: str

    #: The SPDX license identifier, if known
    license: str | None

    #: The required notice text
    notice: str


@dataclass
class LicenseInfo:
    source_path: Path

    #: The SPDX license identifier, if known
    license: str | None = None

    #: The copyright statement, if found in source code
    copyright: str | None = None

    #: The (presumptive) notice text, if found in source code
    notice: str | None = None

    #: Absolute path to an accompanying license file, if found
    license_path: Path | None = None


def find_license_info(source_path: Path) -> LicenseInfo | None:
    """
    Try to locate licensing information for source_path, either in the source
    file content itself or in an accompanying LICENSE (or similar) file.
    Returns None if no licensing information could be found.
    """
    if not source_path.is_file():
        print(f"Unable to read file {source_path}", file=sys.stderr)
        return None

    license_info = extract_license_from_source(source_path) or find_license_file(source_path)
    if not license_info:
        print(f"Couldn't locate license information for {source_path}", file=sys.stderr)

    return license_info


def re_any_literal(literals: Iterable[str]) -> str:
    re_alternatives = r"|".join(re.escape(literal) for literal in literals)
    return rf"(?:{re_alternatives})"

re_comment = re_any_literal(["//", "/*", " *", ""])
re_copyright = re_any_literal(["Copyright", "©", "(c)"])
re_licence_filename = re.compile(r"(?:copying|copyright|notice|license|licence)(?:.txt|.md|)", re.IGNORECASE)
re_separator = re.compile(r"^\s*(?:={10,}|-{10,})\s*$")  # horizontal rules


def extract_license_from_source(source_path: Path) -> LicenseInfo | None:
    """
    Look for a "Copyright" statement in a source comment. If found, return
    that as the copyright and any following lines as the notice.

    (Source file is assumed to use a C-like comment syntax.)
    """
    with source_path.open() as source_file:
        while True:
            line = source_file.readline()
            if not line:
                break

            license = None
            match = re.search(r"SPDX-License-Identifier:(?P<license>.*)", line, re.IGNORECASE)
            if match:
                license = match["license"].strip()
                if license == SPDX_IDENTIFIER_LLVM_EXCEPTION:
                    # No need to look for anything else
                    return LicenseInfo(source_path, license=license)

            match = re.match(
                rf"^(?P<leader>\s*)(?P<comment>{re_comment})\s*(?P<copyright>{re_copyright}.*)$",
                line,
                re.IGNORECASE
            )
            if match:
                copyright = match["copyright"]
                leader = match["leader"]
                comment = match["comment"]
                if comment == "/*":
                    # block comments are typically continued with aligned *
                    comment = " *"
                prefix = leader + comment

                # Extract notice from following lines with same prefix
                notice = ""
                while True:
                    line = source_file.readline()
                    if not line.startswith(prefix):
                        break
                    if comment == "*" and line.startswith(leader + "*/"):
                        break
                    content = line[len(prefix) :]
                    if notice.strip() and re_separator.match(content):
                        # Stop if we hit a separator line after any content line
                        break
                    notice += content
                notice = notice.strip() or None

                return LicenseInfo(
                    source_path,
                    license=license,
                    copyright=copyright,
                    notice=notice,
                )

    return None


def find_license_file(source_path: Path) -> LicenseInfo | None:
    """
    Look for a COPYRIGHT, NOTICE, or LICENSE file in the same directory
    as source_path. If not found, look in parent directories.

    In practice, this will ascribe anything distributed with Emscripten
    to Emscripten's license if there is no intervening license file.
    (Which is probably correct, assuming there's no notice in the
    individual source code file.)
    """
    directory = source_path.parent
    while directory:
        license_paths = [path for path in directory.iterdir() if re_licence_filename.match(path.name)]
        if len(license_paths) > 1:
            filenames = "  " + "\n  ".join(license_paths)
            print(f"Multiple license files for {source_path}:\n{filenames}", file=sys.stderr)
        if license_paths:
            return LicenseInfo(source_path, license_path=license_paths[0])
        directory = directory.parent

    return None


def read_license_file(license_path: Path) -> str:
    """
    Return the license portion of the contents of license_path.
    """
    license_text = license_path.read_text()
    # Special case truncate some known license files after their licenses
    package_name = license_path.parent.name
    if package_name == "emscripten":
        license_text = re.sub(
            r"^This program uses portions of Node.*\Z",
            "", license_text, flags=re.MULTILINE | re.DOTALL)
    elif package_name == "musl":
        license_text = re.sub(
            r"^Authors/contributors include.*\Z",
            "", license_text, flags=re.MULTILINE | re.DOTALL)
    return license_text


def infer_license_identifier(notice: str) -> str | None:
    """
    Try to infer a missing SPDX license identifier from the notice text.
    """
    # Normalize notice text whitespace for comparison purposes
    notice = re.sub(r"\s+", " ", notice.strip())
    if LICENSE_TEXT_LLVM_EXCEPTION in notice:
        return SPDX_IDENTIFIER_LLVM_EXCEPTION
    elif "the MIT license and the University of Illinois/NCSA Open Source License" in notice:
        return "(MIT OR NCSA)"
    elif "MIT license" in notice:
        return "MIT"
    elif "Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice is preserved." in notice:
        return "SunPro"
    return None


def group_dependencies(license_infos: list[LicenseInfo | None]) -> list[Dependency]:
    """
    Group license_infos by common license file or notice text
    and convert to dependencies dict.
    """
    # Group by common license file or notice text
    groups: dict[str | Path, list[LicenseInfo]] = defaultdict(list)
    for license_info in license_infos:
        if license_info:
            key = license_info.license_path or license_info.notice or license_info.source_path
            groups[key].append(license_info)

    dependencies: list[Dependency] = []
    for key, items in groups.items():
        item = items[0]  # a representative item for the group
        notice = item.notice
        if notice is None and item.license_path:
            notice = read_license_file(item.license_path)
        notice = notice or ""
        license_id = item.license or infer_license_identifier(notice)

        if len(items) == 1:
            # Singleton group
            name = item.source_path.name
        elif isinstance(key, Path):
            # All items have the same license file; use its directory name
            name = item.license_path.parent.name
        else:
            # Items share text notice; try to find a common parent directory
            common_parent = commonpath(item.source_path for item in items)
            if common_parent:
                name = Path(common_parent).name
            else:
                name = ", ".join(sorted(item.source_path.name for item in items))

        if license_id == SPDX_IDENTIFIER_LLVM_EXCEPTION:
            # No notice required
            continue

        copyrights = sorted(set(item.copyright for item in items if item.copyright))
        if copyrights:
            linebreak = "\r"  # webapp converts to <br>
            notice = f"{linebreak.join(copyrights)}\n\n{notice}"

        dependencies.append(Dependency(
            name=name,
            license=license_id,
            notice=notice,
        ))
    return dependencies


parser = argparse.ArgumentParser()
parser.add_argument(
    "--sources", "-s",
    type=argparse.FileType("r"),
    help="List of source files",
)
parser.add_argument(
    "--output", "-o",
    type=argparse.FileType("w"),
    help="Generated json dependencies file",
)
parser.add_argument(
    "--emscripten-dir",
    type=Path,
    help="Emscripten root directory (default from emcc on PATH",
)


def main():
    args = parser.parse_args()

    emscripten_dir = args.emscripten_dir
    if not emscripten_dir:
        # Find emcc on PATH and use its directory
        emcc_path = shutil.which("emcc")
        if emcc_path:
            emscripten_dir = Path(emcc_path).parent

    emscripten_license_path = emscripten_dir / "LICENSE"
    if not emscripten_license_path.is_file():
        print(f"Unable to locate LICENSE in {emscripten_dir}", file=sys.stderr)
        exit(1)

    try:
        source_paths = [
            Path(source.strip()) for source in args.sources.readlines()
        ]
        license_infos = [
            find_license_info(source_path) for source_path in source_paths
        ]

        # Replace Emscripten notices with Emscripten license file before grouping
        for license_info in license_infos:
            try:
                if license_info.notice.strip().startswith(EMSCRIPTEN_NOTICE):
                    license_info.license_path = emscripten_license_path
                    license_info.notice = None
            except AttributeError:
                pass

        dependencies = group_dependencies(license_infos)

        json.dump({"dependencies": dependencies}, args.output, indent=2)
        args.output.write("\n")

    finally:
        args.sources.close()
        args.output.close()


if __name__ == "__main__":
    main()
