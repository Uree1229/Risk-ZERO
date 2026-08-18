set script_dir [file dirname [file normalize [info script]]]
set fpga_dir [file normalize "$script_dir/.."]
set project_file [file normalize "$fpga_dir/build/arty-bram-system/risk_zero_arty_bram.xpr"]
set report_dir [file normalize "$fpga_dir/build/reports"]
set xsa_file [file normalize "$fpga_dir/build/risk_zero_arty_a7_100t.xsa"]

if {![file exists $project_file]} {
    error "Project is missing. Run vivado/create_arty_bram_system.tcl first."
}
file mkdir $report_dir
open_project $project_file
source [file normalize "$script_dir/check_arty_target.tcl"]
open_bd_design [get_files risk_zero_system.bd]
validate_bd_design
save_bd_design

launch_runs synth_1 -jobs 4
wait_on_run synth_1
if {![string match "*Complete*" [get_property STATUS [get_runs synth_1]]]} {
    error "Synthesis failed: [get_property STATUS [get_runs synth_1]]"
}
open_run synth_1
report_utilization -file [file normalize "$report_dir/post_synth_utilization.rpt"]

launch_runs impl_1 -to_step write_bitstream -jobs 4
wait_on_run impl_1
if {![string match "*Complete*" [get_property STATUS [get_runs impl_1]]]} {
    error "Implementation failed: [get_property STATUS [get_runs impl_1]]"
}
open_run impl_1
report_timing_summary -delay_type min_max -report_unconstrained -check_timing_verbose \
    -file [file normalize "$report_dir/post_route_timing_summary.rpt"]
report_utilization -file [file normalize "$report_dir/post_route_utilization.rpt"]

set wns [get_property STATS.WNS [get_runs impl_1]]
if {![string is double -strict $wns] || $wns < 0.0} {
    error "Timing did not close. WNS=$wns. Review $report_dir/post_route_timing_summary.rpt"
}

write_hw_platform -fixed -include_bit -force -file $xsa_file
puts "PASS: bitstream and XSA generated. WNS=$wns"
puts "XSA: $xsa_file"
