set script_dir [file dirname [file normalize [info script]]]
set fpga_dir [file normalize "$script_dir/.."]
set memory_profile "bram"
if {[info exists ::env(RISK_ZERO_MEMORY_PROFILE)]} {
    set memory_profile [string tolower $::env(RISK_ZERO_MEMORY_PROFILE)]
}
switch -- $memory_profile {
    bram {
        set project_file [file normalize "$fpga_dir/build/arty-bram-system/risk_zero_arty_bram.xpr"]
        set report_dir [file normalize "$fpga_dir/build/reports"]
        set xsa_file [file normalize "$fpga_dir/build/risk_zero_arty_a7_100t.xsa"]
        set create_script "vivado/create_arty_bram_system.tcl"
    }
    ddr {
        set project_file [file normalize "$fpga_dir/build/arty-ddr-system/risk_zero_arty_ddr.xpr"]
        set report_dir [file normalize "$fpga_dir/build/reports-ddr"]
        set xsa_file [file normalize "$fpga_dir/build/risk_zero_arty_a7_100t_ddr.xsa"]
        set create_script "vivado/create_arty_ddr_system.tcl"
    }
    default {
        error "Unsupported RISK_ZERO_MEMORY_PROFILE '$memory_profile'; expected bram or ddr."
    }
}

if {![file exists $project_file]} {
    error "Project is missing. Run $create_script first."
}
file mkdir $report_dir
open_project $project_file
source [file normalize "$script_dir/check_arty_target.tcl"]
set_property PLATFORM.DEFAULT_OUTPUT_TYPE hw_export [current_project]
set_property PLATFORM.DESIGN_INTENT.EMBEDDED true [current_project]
set_property PLATFORM.DESIGN_INTENT.DATACENTER false [current_project]
set_property PLATFORM.DESIGN_INTENT.EXTERNAL_HOST false [current_project]
set_property PLATFORM.DESIGN_INTENT.SERVER_MANAGED false [current_project]
open_bd_design [get_files risk_zero_system.bd]
if {$memory_profile eq "ddr"} {
    set_property USED_IN_SYNTHESIS false \
        [get_files [file normalize "$fpga_dir/constraints/risk_zero_arty_a7_100_ddr.xdc"]]
    set_property CONFIG.PRIM_SOURCE No_buffer [get_bd_cells system_clk_wiz]
}
validate_bd_design
save_bd_design

set synth_needs_reset [string match "*ERROR*" [get_property STATUS [get_runs synth_1]]]
if {![catch {set synth_needs_refresh [get_property NEEDS_REFRESH [get_runs synth_1]]}] &&
    [string is true -strict $synth_needs_refresh]} {
    set synth_needs_reset true
}
if {$synth_needs_reset} {
    reset_run synth_1
}
launch_runs synth_1 -jobs 4
wait_on_run synth_1
if {![string match "*Complete*" [get_property STATUS [get_runs synth_1]]]} {
    error "Synthesis failed: [get_property STATUS [get_runs synth_1]]"
}
open_run synth_1
report_utilization -file [file normalize "$report_dir/post_synth_utilization.rpt"]

if {[string match "*ERROR*" [get_property STATUS [get_runs impl_1]]]} {
    reset_run impl_1
}
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
