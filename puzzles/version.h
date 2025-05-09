/*
 * This header file provides the version #define for a particular
 * build of Puzzles.
 *
 * When my automated build system does a full build, Buildscr
 * completely overwrites this file with information appropriate to
 * that build. The information _here_ is default stuff used for local
 * development runs of 'make'.
 *
 * Build environments can also supply version information via C_FLAGS:
 * -DVER="Version YYYYmmdd.VCSID" -DVERSIONINFO_BINARY_VERSION=1,YYYY,mm,dd
 */

#ifndef VER
#define VER "Unidentified build"
#endif

#ifndef VERSIONINFO_BINARY_VERSION
#define VERSIONINFO_BINARY_VERSION 0,0,0,0
#endif