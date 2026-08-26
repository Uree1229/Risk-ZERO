"""Create and build the RISK-ZERO MicroBlaze DDR application with Vitis 2025.2.

Run this file with ``vitis -s`` after exporting the DDR XSA.  Vitis has path
length problems when the repository path contains spaces, so BOARD_BRINGUP.md
uses a temporary ``R:`` drive mapping on Windows.
"""

from __future__ import annotations

import os
from pathlib import Path

import vitis


APP_NAME = "risk_zero_app_ddr"
PLATFORM_NAME = "risk_zero_platform_ddr"
DOMAIN_NAME = "standalone_microblaze_0"
DDR_REGION_NAME = "mig_7series_0_memory_0"
SOURCE_FILES = [
    "main.c",
    "http_status.c",
    "http_status.h",
    "motion_hw.c",
    "motion_hw.h",
    "risk_zero_app.c",
    "risk_zero_app.h",
    "risk_zero_config.h",
    "rzfp_protocol.c",
    "rzfp_protocol.h",
    "trajectory_status.c",
    "trajectory_status.h",
]


def vitis_path(path: Path) -> str:
    # Do not use Path.resolve() here. Vitis' Python resolves a Windows subst
    # drive back to the long physical path, reintroducing the spaces/path length
    # that the drive mapping is intended to avoid.
    return path.absolute().as_posix()


def replace_exact(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected Vitis template text is missing in {path}: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")


script_dir = Path(__file__).absolute().parent
fpga_dir = script_dir.parent
xsa = fpga_dir / "build" / "risk_zero_arty_a7_100t_ddr.xsa"
workspace = Path(
    os.environ.get(
        "RISK_ZERO_VITIS_WORKSPACE",
        str(fpga_dir / "build" / "vitis-workspace-ddr"),
    )
)

if not xsa.is_file():
    raise FileNotFoundError(
        f"DDR XSA is missing: {xsa}. Run vivado/build_arty_ddr_system.tcl first."
    )
for component_name in (PLATFORM_NAME, APP_NAME):
    component_dir = workspace / component_name
    if component_dir.exists():
        raise FileExistsError(
            f"Generated component already exists: {component_dir}. "
            "Use an empty RISK_ZERO_VITIS_WORKSPACE to reproduce the build."
        )

client = vitis.create_client()
client.set_workspace(path=vitis_path(workspace))

platform = client.create_platform_component(
    name=PLATFORM_NAME,
    hw_design=vitis_path(xsa),
    cpu="microblaze_0",
    os="standalone",
    domain_name=DOMAIN_NAME,
    template="lwip_echo_server",
    generate_dtb=False,
)
if platform.build() != 0:
    raise RuntimeError("Vitis platform/BSP build failed")

xpfm = (
    workspace
    / PLATFORM_NAME
    / "export"
    / PLATFORM_NAME
    / f"{PLATFORM_NAME}.xpfm"
)
app = client.create_app_component(
    name=APP_NAME,
    platform=vitis_path(xpfm),
    domain=DOMAIN_NAME,
    template="lwip_echo_server",
)

linker = app.get_ld_script()
regions = linker.get_memory_regions()
ddr_region = next(
    (region for region in regions if region["name"] == DDR_REGION_NAME),
    None,
)
if ddr_region is None or ddr_region["base_address"].lower() != "0x80000000":
    raise RuntimeError(f"Expected 256 MiB DDR region is absent: {regions}")
linker.set_heap_size("0x10000")
linker.set_stack_size("0x2000")

# Keep the lwIP template's platform.c/platform.h/linker support, but replace its
# echo application with the repository implementation.
app.remove_files(["src/main.c", "src/echo.c"])
app.import_files(
    from_loc=vitis_path(fpga_dir / "software" / "src"),
    files=SOURCE_FILES,
    dest_dir_in_cmp="src",
)

app_src = workspace / APP_NAME / "src"
replace_exact(
    app_src / "CMakeLists.txt",
    "collect (PROJECT_LIB_SOURCES echo.c)\n",
    "",
)
replace_exact(
    app_src / "CMakeLists.txt",
    "collect (PROJECT_LIB_SOURCES main.c)\n",
    "",
)
replace_exact(
    app_src / "UserConfig.cmake",
    "set(USER_COMPILE_OPTIMIZATION_LEVEL -O0)",
    "set(USER_COMPILE_OPTIMIZATION_LEVEL -Os)",
)
replace_exact(
    app_src / "UserConfig.cmake",
    "set(USER_COMPILE_DEBUG_LEVEL -g3)",
    "set(USER_COMPILE_DEBUG_LEVEL )",
)

if app.build() != 0:
    raise RuntimeError("RISK-ZERO application build failed")

elf = workspace / APP_NAME / "build" / f"{APP_NAME}.elf"
if not elf.is_file():
    raise FileNotFoundError(f"Vitis reported success but did not create {elf}")
print(f"PASS: DDR MicroBlaze ELF generated: {elf}")
