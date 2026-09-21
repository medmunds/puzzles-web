# Extract installed TypeScript version from pnpm-lock.yaml

import sys
import yaml

PNPM_LOCK = "/app/pnpm-lock.yaml"

if __name__ == "__main__":
    for doc in yaml.safe_load_all(open(PNPM_LOCK)):
        try:
            dev_dependencies = doc["importers"]["."]["devDependencies"]
        except KeyError:
            continue  # wrong subdocument
        version = dev_dependencies["typescript"]["version"]
        version = version.split("(")[0]  # strip (peer dependency suffixes)
        print(version)
        break
    else:
        print(f"devDependencies not found in {PNPM_LOCK}", stream=sys.stderr)
        sys.exit(1)
