set script_dir [file dirname [file normalize [info script]]]
set fpga_dir [file normalize "$script_dir/.."]
set rtl_dir [file normalize "$fpga_dir/rtl"]
set build_dir [file normalize "$fpga_dir/build/ov7670-probe"]
set report_dir [file normalize "$build_dir/reports"]
set bitstream_file [file normalize "$build_dir/risk_zero_ov7670_probe.bit"]

file mkdir $report_dir
create_project -in_memory -part xc7a100tcsg324-1
set_property target_language Verilog [current_project]

read_verilog -sv [list \
    "$rtl_dir/risk_zero_camera_xclk.sv" \
    "$rtl_dir/risk_zero_sccb_master.sv" \
    "$rtl_dir/risk_zero_ov7670_id_probe.sv" \
    "$rtl_dir/risk_zero_ov7670_probe_top.sv"]
read_xdc [list [file normalize "$fpga_dir/constraints/risk_zero_ov7670_probe_arty_a7_100.xdc"]]

synth_design -top risk_zero_ov7670_probe_top -part xc7a100tcsg324-1
report_utilization -file [file join $report_dir post_synth_utilization.rpt]

opt_design
place_design
phys_opt_design
route_design

report_timing_summary -delay_type min_max -report_unconstrained \
    -check_timing_verbose -file [file join $report_dir post_route_timing_summary.rpt]
report_utilization -file [file join $report_dir post_route_utilization.rpt]

set timing_paths [get_timing_paths -delay_type max -max_paths 1]
if {[llength $timing_paths] == 0} {
    error "No routed timing path found"
}
set wns [get_property SLACK [lindex $timing_paths 0]]
if {![string is double -strict $wns] || $wns < 0.0} {
    error "Timing did not close. WNS=$wns"
}

set_property BITSTREAM.GENERAL.COMPRESS TRUE [current_design]
write_bitstream -force $bitstream_file
puts "PASS: OV7670 ID probe bitstream generated. WNS=$wns"
puts "BITSTREAM: $bitstream_file"

close_project
