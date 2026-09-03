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
            "CONFIG.C_INCLUDE_MDIO {1}",
            "axi_timer",
            "axi_uartlite",
            "risk_zero_motion",
            'board_interface "eth_mii"',
            'board_interface "eth_mdio_mdc"',
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

    def test_safety_gate_is_default_deny_and_simulated(self) -> None:
        rtl = (FPGA_ROOT / "rtl" / "risk_zero_safety_gate_fsm.sv").read_text(encoding="utf-8")
        runner = (FPGA_ROOT / "vivado" / "run_rtl_tests.tcl").read_text(encoding="utf-8")
        testbench = (FPGA_ROOT / "sim" / "tb_risk_zero_safety_gate_fsm.sv").read_text(encoding="utf-8")
        for required in (
            "ST_BOOT",
            "ST_LOCKED",
            "ST_UNLOCK",
            "ST_FAULT",
            "AUTH_TIMEOUT_CYCLES",
            "HEARTBEAT_TIMEOUT_CYCLES",
            "auth_toggle",
            "req_toggle",
            "door_closed_direct",
            "tamper_detected",
            "estop_n",
            "unlock_allow_pulse <= 0",
        ):
            self.assertIn(required, rtl)
        self.assertIn("tb_risk_zero_safety_gate_fsm", runner)
        self.assertIn("heartbeat timeout did not fail closed", testbench)
        self.assertIn("E-stop did not immediately abort synchronized pulse", testbench)

    def test_camera_dvp_receiver_validates_geometry_in_pclk_domain(self) -> None:
        rtl = (FPGA_ROOT / "rtl" / "risk_zero_camera_dvp_rx.sv").read_text(encoding="utf-8")
        runner = (FPGA_ROOT / "vivado" / "run_rtl_tests.tcl").read_text(encoding="utf-8")
        testbench = (FPGA_ROOT / "sim" / "tb_risk_zero_camera_dvp_rx.sv").read_text(encoding="utf-8")
        for required in (
            "cam_pclk",
            "cam_data",
            "cam_vsync",
            "cam_href",
            "vision_enable",
            "frame_geometry_valid",
            "geometry_error",
            "frame_pixel_count == FRAME_PIXELS",
            "frame_line_count == FRAME_HEIGHT",
        ):
            self.assertIn(required, rtl)
        self.assertIn("tb_risk_zero_camera_dvp_rx", runner)
        self.assertIn("valid frame geometry was not accepted", testbench)
        self.assertIn("malformed frame geometry was not rejected", testbench)

    def test_camera_xclk_is_parameterized_disabled_low_and_simulated(self) -> None:
        rtl = (FPGA_ROOT / "rtl" / "risk_zero_camera_xclk.sv").read_text(encoding="utf-8")
        runner = (FPGA_ROOT / "vivado" / "run_rtl_tests.tcl").read_text(encoding="utf-8")
        testbench = (FPGA_ROOT / "sim" / "tb_risk_zero_camera_xclk.sv").read_text(encoding="utf-8")
        for required in (
            "SYS_CLK_HZ",
            "XCLK_HZ",
            "HALF_PERIOD_CYCLES",
            "if (!resetn || !enable)",
            "cam_xclk <= 0",
        ):
            self.assertIn(required, rtl)
        self.assertIn("tb_risk_zero_camera_xclk", runner)
        self.assertIn("camera XCLK period is not 40 ns", testbench)
        self.assertIn("disabled camera XCLK was not held low", testbench)

    def test_camera_contribution_is_split_into_verified_primitives(self) -> None:
        runner = (FPGA_ROOT / "vivado" / "run_rtl_tests.tcl").read_text(encoding="utf-8")
        sccb = (FPGA_ROOT / "rtl" / "risk_zero_sccb_master.sv").read_text(encoding="utf-8")
        probe = (FPGA_ROOT / "rtl" / "risk_zero_ov7670_id_probe.sv").read_text(encoding="utf-8")
        yuv = (FPGA_ROOT / "rtl" / "risk_zero_camera_yuv422_y_extract.sv").read_text(encoding="utf-8")
        fifo = (FPGA_ROOT / "rtl" / "risk_zero_async_fifo.sv").read_text(encoding="utf-8")
        synthesis = (FPGA_ROOT / "vivado" / "run_camera_primitive_synthesis.tcl").read_text(
            encoding="utf-8"
        )

        for test_top in (
            "tb_risk_zero_sccb_master",
            "tb_risk_zero_ov7670_id_probe",
            "tb_risk_zero_camera_yuv422_y_extract",
            "tb_risk_zero_async_fifo",
        ):
            self.assertIn(test_top, runner)

        self.assertIn("did not emit its PASS marker", runner)

        self.assertIn("ST_ADDRESS_STOP_FREE", sccb)
        self.assertIn("ST_READ_START_ASSERT", sccb)
        self.assertIn("siod_drive_low", sccb)
        self.assertIn("register_address <= 8'h0A", probe)
        self.assertIn("register_address <= 8'h0B", probe)
        self.assertNotIn("init_table", probe)
        self.assertIn("Y_BYTE_PHASE", yuv)
        self.assertIn('ASYNC_REG = "TRUE"', fifo)
        self.assertIn("xc7a100tcsg324-1", synthesis)
        for top_module in (
            "risk_zero_sccb_master",
            "risk_zero_ov7670_id_probe",
            "risk_zero_camera_yuv422_y_extract",
            "risk_zero_async_fifo",
        ):
            self.assertIn(top_module, synthesis)

    def test_tcl_files_have_balanced_delimiters(self) -> None:
        for script_path in (FPGA_ROOT / "vivado").glob("*.tcl"):
            script = script_path.read_text(encoding="utf-8")
            with self.subTest(script=script_path.name):
                self.assertEqual(script.count("{"), script.count("}"))
                self.assertEqual(script.count("["), script.count("]"))
                self.assertNotIn("!~", script)


if __name__ == "__main__":
    unittest.main()
