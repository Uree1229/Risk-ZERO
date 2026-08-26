from pathlib import Path
import unittest


FPGA_ROOT = Path(__file__).resolve().parents[1]


class VivadoAssetTests(unittest.TestCase):
    def test_bram_system_targets_exact_board_and_required_ips(self) -> None:
        script = (FPGA_ROOT / "vivado" / "create_arty_bram_system.tcl").read_text(encoding="utf-8")
        for required in (
            "xc7a100tcsg324-1",
            "local_mem {128KB}",
            "set_property range 0x00040000",
            "axi_ethernetlite",
            "axi_timer",
            "axi_uartlite",
            "risk_zero_motion",
            'board_interface "eth_mii"',
            'board_interface "usb_uart"',
            "CLKOUT2_REQUESTED_OUT_FREQ {25.000}",
        ):
            self.assertIn(required, script)

    def test_board_constraints_pin_clock_reset_and_phy_reference(self) -> None:
        constraints = (FPGA_ROOT / "constraints" / "risk_zero_arty_a7_100.xdc").read_text(encoding="utf-8")
        self.assertIn("PACKAGE_PIN E3", constraints)
        self.assertIn("PACKAGE_PIN C2", constraints)
        self.assertIn("PACKAGE_PIN G18", constraints)
        self.assertIn("period 10.000", constraints)

    def test_build_requires_timing_closure_and_exports_xsa(self) -> None:
        script = (FPGA_ROOT / "vivado" / "build_arty_system.tcl").read_text(encoding="utf-8")
        self.assertIn("report_timing_summary", script)
        self.assertIn("$wns < 0.0", script)
        self.assertIn("write_hw_platform -fixed -include_bit", script)
        self.assertIn("PLATFORM.DEFAULT_OUTPUT_TYPE hw_export", script)
        self.assertIn("PLATFORM.DESIGN_INTENT.EMBEDDED true", script)

    def test_ddr_profile_uses_mig_caches_and_separate_outputs(self) -> None:
        create = (FPGA_ROOT / "vivado" / "create_arty_bram_system.tcl").read_text(encoding="utf-8")
        build = (FPGA_ROOT / "vivado" / "build_arty_system.tcl").read_text(encoding="utf-8")
        constraints = (FPGA_ROOT / "constraints" / "risk_zero_arty_a7_100_ddr.xdc").read_text(encoding="utf-8")
        for required in (
            'RISK_ZERO_MEMORY_PROFILE',
            'mig_7series',
            'board_interface "ddr3_sdram"',
            'set microblaze_cache {32KB}',
            'Master {/microblaze_0 (Cached)}',
            'CONFIG.CLKOUT1_REQUESTED_OUT_FREQ {25.000}',
            'CONFIG.CLKOUT2_REQUESTED_OUT_FREQ {100.000}',
        ):
            self.assertIn(required, create)
        self.assertIn("risk_zero_arty_a7_100t_ddr.xsa", build)
        self.assertIn("reports-ddr", build)
        self.assertIn("IOSTANDARD LVCMOS33", constraints)
        self.assertTrue((FPGA_ROOT / "vivado" / "create_arty_ddr_system.tcl").is_file())
        self.assertTrue((FPGA_ROOT / "vivado" / "build_arty_ddr_system.tcl").is_file())

    def test_vitis_ddr_build_keeps_lwip_platform_and_heap(self) -> None:
        script = (FPGA_ROOT / "vitis" / "build_ddr_app.py").read_text(encoding="utf-8")
        for required in (
            'template="lwip_echo_server"',
            'DDR_REGION_NAME = "mig_7series_0_memory_0"',
            'linker.set_heap_size("0x10000")',
            'linker.set_stack_size("0x2000")',
            '"src/main.c", "src/echo.c"',
            '"set(USER_COMPILE_OPTIMIZATION_LEVEL -Os)"',
        ):
            self.assertIn(required, script)

    def test_rtl_runner_includes_core_and_axi_channel_tests(self) -> None:
        script = (FPGA_ROOT / "vivado" / "run_rtl_tests.tcl").read_text(encoding="utf-8")
        self.assertIn("tb_risk_zero_motion_core", script)
        self.assertIn("tb_risk_zero_motion_axi_lite", script)
        testbench = (FPGA_ROOT / "sim" / "tb_risk_zero_motion_axi_lite.sv").read_text(encoding="utf-8")
        self.assertIn("write_address_first", testbench)
        self.assertIn("write_data_first", testbench)

    def test_tcl_files_have_balanced_delimiters(self) -> None:
        for script_path in (FPGA_ROOT / "vivado").glob("*.tcl"):
            script = script_path.read_text(encoding="utf-8")
            with self.subTest(script=script_path.name):
                self.assertEqual(script.count("{"), script.count("}"))
                self.assertEqual(script.count("["), script.count("]"))
                self.assertNotIn("!~", script)


if __name__ == "__main__":
    unittest.main()
