set script_dir [file dirname [file normalize [info script]]]
source [file normalize "$script_dir/create_rtl_project.tcl"]
set_property xsim.simulate.runtime 0ns [get_filesets sim_1]

foreach test_spec {
    {tb_risk_zero_motion_core "PASS: risk_zero_motion_core"}
    {tb_risk_zero_motion_axi_lite "PASS: risk_zero_motion_axi_lite independent channels"}
    {tb_risk_zero_safety_gate_fsm "PASS: risk_zero_safety_gate_fsm"}
    {tb_risk_zero_camera_dvp_rx "PASS: risk_zero_camera_dvp_rx"}
    {tb_risk_zero_camera_xclk "PASS: risk_zero_camera_xclk"}
    {tb_risk_zero_sccb_master "PASS: risk_zero_sccb_master write_and_two_transaction_read"}
    {tb_risk_zero_ov7670_id_probe "PASS: risk_zero_ov7670_id_probe ready_id_fault_timeout"}
    {tb_risk_zero_camera_yuv422_y_extract "PASS: risk_zero_camera_yuv422_y_extract both_byte_phases"}
    {tb_risk_zero_async_fifo "PASS: risk_zero_async_fifo order_underflow_overflow"}
} {
    lassign $test_spec test_top pass_marker
    puts "Running $test_top"
    set_property top $test_top [get_filesets sim_1]
    update_compile_order -fileset sim_1
    launch_simulation -simset sim_1 -mode behavioral
    run all
    close_sim

    set sim_log [file join $project_dir risk_zero_motion.sim sim_1 behav xsim simulate.log]
    if {![file exists $sim_log]} {
        error "$test_top did not create an XSIM log"
    }
    set log_handle [open $sim_log r]
    set log_text [read $log_handle]
    close $log_handle
    if {[string first $pass_marker $log_text] < 0} {
        error "$test_top did not emit its PASS marker; inspect $sim_log"
    }
}

close_project
puts "PASS: all RISK-ZERO RTL simulations completed"
