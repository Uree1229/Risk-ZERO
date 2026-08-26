set script_dir [file dirname [file normalize [info script]]]
source [file normalize "$script_dir/create_rtl_project.tcl"]
set_property xsim.simulate.runtime 0ns [get_filesets sim_1]

foreach test_top [list tb_risk_zero_motion_core tb_risk_zero_motion_axi_lite] {
    puts "Running $test_top"
    set_property top $test_top [get_filesets sim_1]
    update_compile_order -fileset sim_1
    launch_simulation -simset sim_1 -mode behavioral
    run all
    close_sim
}

close_project
puts "PASS: all RISK-ZERO RTL simulations completed"
