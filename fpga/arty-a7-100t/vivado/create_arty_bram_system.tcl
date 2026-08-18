set script_dir [file dirname [file normalize [info script]]]
set fpga_dir [file normalize "$script_dir/.."]
set project_dir [file normalize "$fpga_dir/build/arty-bram-system"]
set ip_repo_dir [file normalize "$fpga_dir/build/ip-repository"]
set constraints_file [file normalize "$fpga_dir/constraints/risk_zero_arty_a7_100.xdc"]
set design_name "risk_zero_system"
set expected_part "xc7a100tcsg324-1"

proc latest_ip {pattern} {
    set definitions [get_ipdefs -quiet $pattern]
    if {[llength $definitions] == 0} {
        set definitions [get_ipdefs -all -quiet $pattern]
    }
    if {[llength $definitions] == 0} {
        error "Required Vivado IP is unavailable: $pattern"
    }
    return [lindex $definitions end]
}

set packaged_component [file normalize "$ip_repo_dir/risk_zero_motion_1_0/component.xml"]
if {![file exists $packaged_component]} {
    puts "Packaging RISK-ZERO motion IP first..."
    source [file normalize "$script_dir/package_motion_ip.tcl"]
    close_project
}

create_project risk_zero_arty_bram $project_dir -part $expected_part -force
set_property target_language Verilog [current_project]
set_property simulator_language Mixed [current_project]

if {[catch {set board_candidates [get_board_parts -quiet -latest_file_version *arty-a7-100*]}]} {
    set board_candidates [get_board_parts -quiet *arty-a7-100*]
}
if {[llength $board_candidates] == 0} {
    error "Digilent Arty A7-100 board files are missing. Install Digilent/vivado-boards and rerun."
}
set board_part [lindex $board_candidates end]
set_property board_part $board_part [current_project]
puts "Using board part: $board_part"

set_property ip_repo_paths [list $ip_repo_dir] [current_project]
update_ip_catalog
add_files -fileset constrs_1 -norecurse $constraints_file

create_bd_design $design_name
current_bd_design $design_name

set clk_wiz [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:clk_wiz:*"] clk_wiz_0]
set_property -dict [list \
    CONFIG.PRIM_IN_FREQ {100.000} \
    CONFIG.CLKOUT1_REQUESTED_OUT_FREQ {100.000} \
    CONFIG.CLKOUT2_USED {true} \
    CONFIG.CLKOUT2_REQUESTED_OUT_FREQ {25.000} \
    CONFIG.NUM_OUT_CLKS {2} \
    CONFIG.RESET_TYPE {ACTIVE_LOW} \
    CONFIG.RESET_PORT {resetn}] $clk_wiz

set sys_clk [create_bd_port -dir I -type clk CLK100MHZ]
set_property CONFIG.FREQ_HZ 100000000 $sys_clk
set reset_n [create_bd_port -dir I -type rst ck_rst]
set_property CONFIG.POLARITY ACTIVE_LOW $reset_n
set eth_ref_clk [create_bd_port -dir O -type clk eth_ref_clk]
set_property CONFIG.FREQ_HZ 25000000 $eth_ref_clk
connect_bd_net $sys_clk [get_bd_pins clk_wiz_0/clk_in1]
connect_bd_net $reset_n [get_bd_pins clk_wiz_0/resetn]
connect_bd_net [get_bd_pins clk_wiz_0/clk_out2] $eth_ref_clk

set microblaze [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:microblaze:*"] microblaze_0]
apply_bd_automation -rule xilinx.com:bd_rule:microblaze -config [list \
    axi_intc {1} \
    axi_periph {Enabled} \
    cache {None} \
    clk {/clk_wiz_0/clk_out1 (100 MHz)} \
    debug_module {Debug Only} \
    ecc {None} \
    local_mem {256KB} \
    preset {None}] $microblaze

set reset_cells [get_bd_cells -quiet -filter {VLNV =~ "xilinx.com:ip:proc_sys_reset:*"}]
foreach reset_cell $reset_cells {
    set_property CONFIG.C_EXT_RESET_HIGH 0 $reset_cell
    set ext_reset_pin [get_bd_pins -quiet $reset_cell/ext_reset_in]
    foreach existing_net [get_bd_nets -quiet -of_objects $ext_reset_pin] {
        disconnect_bd_net $existing_net $ext_reset_pin
    }
    connect_bd_net $reset_n $ext_reset_pin
    set dcm_locked_pin [get_bd_pins -quiet $reset_cell/dcm_locked]
    if {[llength [get_bd_nets -quiet -of_objects $dcm_locked_pin]] == 0} {
        connect_bd_net [get_bd_pins clk_wiz_0/locked] $dcm_locked_pin
    }
    set sync_clk_pin [get_bd_pins -quiet $reset_cell/slowest_sync_clk]
    if {[llength [get_bd_nets -quiet -of_objects $sync_clk_pin]] == 0} {
        connect_bd_net [get_bd_pins clk_wiz_0/clk_out1] $sync_clk_pin
    }
}
foreach generated_reset [get_bd_ports -quiet reset*] {
    if {$generated_reset ne $reset_n} {
        delete_bd_objs $generated_reset
    }
}

set ethernet [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:axi_ethernetlite:*"] axi_ethernetlite_0]
set_property -dict [list \
    CONFIG.C_INCLUDE_INTERNAL_LOOPBACK {0} \
    CONFIG.C_INCLUDE_MDIO {0} \
    CONFIG.C_RX_PING_PONG {1} \
    CONFIG.C_TX_PING_PONG {1}] $ethernet
apply_board_connection -board_interface "eth_mii" -ip_intf "axi_ethernetlite_0/MII" -diagram $design_name

set timer [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:axi_timer:*"] axi_timer_0]
set_property -dict [list CONFIG.enable_timer2 {0}] $timer

set uart [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:axi_uartlite:*"] axi_uartlite_0]
set_property CONFIG.C_BAUDRATE 115200 $uart
apply_board_connection -board_interface "usb_uart" -ip_intf "axi_uartlite_0/UART" -diagram $design_name

set motion [create_bd_cell -type ip -vlnv [latest_ip "risk-zero.local:user:risk_zero_motion:*"] risk_zero_motion_0]

set peripheral_interconnect [lindex [get_bd_cells -quiet -filter {NAME =~ "*axi_periph*" && VLNV =~ "xilinx.com:ip:axi_interconnect:*"}] 0]
if {$peripheral_interconnect eq ""} {
    error "MicroBlaze automation did not create the peripheral AXI interconnect."
}
set first_new_master [get_property CONFIG.NUM_MI $peripheral_interconnect]
set_property CONFIG.NUM_MI [expr {$first_new_master + 4}] $peripheral_interconnect

set peripheral_slaves [list \
    "axi_ethernetlite_0/S_AXI" \
    "axi_timer_0/S_AXI" \
    "risk_zero_motion_0/s_axi" \
    "axi_uartlite_0/S_AXI"]
set system_clock_pin [get_bd_pins clk_wiz_0/clk_out1]
set system_reset_pin [lindex [get_bd_pins -quiet -of_objects $reset_cells -filter {NAME =~ "*/peripheral_aresetn"}] 0]
if {$system_reset_pin eq ""} {
    error "MicroBlaze automation did not create a peripheral reset output."
}

for {set index 0} {$index < [llength $peripheral_slaves]} {incr index} {
    set master_index [expr {$first_new_master + $index}]
    set master_name [format "M%02d" $master_index]
    set slave_path [lindex $peripheral_slaves $index]
    connect_bd_intf_net \
        [get_bd_intf_pins $peripheral_interconnect/${master_name}_AXI] \
        [get_bd_intf_pins $slave_path]
    connect_bd_net $system_clock_pin [get_bd_pins $peripheral_interconnect/${master_name}_ACLK]
    connect_bd_net $system_reset_pin [get_bd_pins $peripheral_interconnect/${master_name}_ARESETN]
}

foreach peripheral [list axi_ethernetlite_0 axi_timer_0 risk_zero_motion_0 axi_uartlite_0] {
    connect_bd_net $system_clock_pin [get_bd_pins $peripheral/s_axi_aclk]
    connect_bd_net $system_reset_pin [get_bd_pins $peripheral/s_axi_aresetn]
}

set interrupt_controller [lindex [get_bd_cells -quiet -filter {VLNV =~ "xilinx.com:ip:axi_intc:*"}] 0]
if {$interrupt_controller eq ""} {
    error "MicroBlaze interrupt controller is missing."
}
set interrupt_concat [lindex [get_bd_cells -quiet -filter {VLNV =~ "xilinx.com:ip:xlconcat:*"}] 0]
if {$interrupt_concat eq ""} {
    set interrupt_concat [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:xlconcat:*"] interrupt_concat]
    connect_bd_net [get_bd_pins $interrupt_concat/dout] [get_bd_pins $interrupt_controller/intr]
}
set_property CONFIG.NUM_PORTS 2 $interrupt_concat
connect_bd_net [get_bd_pins axi_ethernetlite_0/IP2INTC_Irpt] [get_bd_pins $interrupt_concat/In0]
connect_bd_net [get_bd_pins axi_timer_0/interrupt] [get_bd_pins $interrupt_concat/In1]

assign_bd_address
validate_bd_design
save_bd_design

set bd_file [get_files "$design_name.bd"]
generate_target all $bd_file
set wrapper [make_wrapper -files $bd_file -top]
add_files -norecurse $wrapper
set_property top ${design_name}_wrapper [get_filesets sources_1]
update_compile_order -fileset sources_1
save_project

puts "RISK-ZERO BRAM bring-up project created: $project_dir"
puts "Target: $expected_part / board $board_part"
puts "Profile: MicroBlaze 100MHz, 256KB LMB, EthernetLite MII, UARTLite, AXI timer, motion IP"
puts "Next: source vivado/build_arty_system.tcl"
