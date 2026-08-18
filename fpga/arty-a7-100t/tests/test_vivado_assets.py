from pathlib import Path
import unittest


FPGA_ROOT = Path(__file__).resolve().parents[1]


class VivadoAssetTests(unittest.TestCase):
    def test_bram_system_targets_exact_board_and_required_ips(self) -> None:
        script = (FPGA_ROOT / "vivado" / "create_arty_bram_system.tcl").read_text(encoding="utf-8")
        for required in (
            "xc7a100tcsg324-1",
            "local_mem {256KB}",
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
