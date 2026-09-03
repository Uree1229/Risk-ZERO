set script_dir [file dirname [file normalize [info script]]]
set fpga_dir [file normalize "$script_dir/.."]
set ip_repo_dir [file normalize "$fpga_dir/build/ip-repository"]
set design_name "risk_zero_system"
set expected_part "xc7a100tcsg324-1"
set memory_profile "bram"
if {[info exists ::env(RISK_ZERO_MEMORY_PROFILE)]} {
    set memory_profile [string tolower $::env(RISK_ZERO_MEMORY_PROFILE)]
}
switch -- $memory_profile {
    bram {
        set project_name "risk_zero_arty_bram"
        set project_dir [file normalize "$fpga_dir/build/arty-bram-system"]
        set constraints_file [file normalize "$fpga_dir/constraints/risk_zero_arty_a7_100.xdc"]
    }
    ddr {
        set project_name "risk_zero_arty_ddr"
        set project_dir [file normalize "$fpga_dir/build/arty-ddr-system"]
        set constraints_file [file normalize "$fpga_dir/constraints/risk_zero_arty_a7_100_ddr.xdc"]
    }
    default {
        error "Unsupported RISK_ZERO_MEMORY_PROFILE '$memory_profile'; expected bram or ddr."
    }
}

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

create_project $project_name $project_dir -part $expected_part -force
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
add_files -fileset constrs_1 -norecurse [list $constraints_file]
if {$memory_profile eq "ddr"} {
    set_property USED_IN_SYNTHESIS false [get_files $constraints_file]
}

create_bd_design $design_name
current_bd_design $design_name

set eth_ref_clk [create_bd_port -dir O -type clk eth_ref_clk]
set_property CONFIG.FREQ_HZ 25000000 $eth_ref_clk

if {$memory_profile eq "bram"} {
    set clk_wiz [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:clk_wiz:*"] clk_wiz_0]
    set_property -dict [list \
        CONFIG.PRIM_IN_FREQ {100.000} \
        CONFIG.CLKOUT1_REQUESTED_OUT_FREQ {100.000} \
        CONFIG.CLKOUT2_USED {true} \
        CONFIG.CLKOUT2_REQUESTED_OUT_FREQ {25.000} \
        CONFIG.NUM_OUT_CLKS {2} \
        CONFIG.RESET_TYPE {ACTIVE_LOW} \
        CONFIG.RESET_PORT {resetn}] $clk_wiz

    set sys_clk [create_bd_port -dir I -type clk -freq_hz 100000000 CLK100MHZ]
    set reset_n [create_bd_port -dir I -type rst ck_rst]
    set_property CONFIG.POLARITY ACTIVE_LOW $reset_n
    connect_bd_net $sys_clk [get_bd_pins clk_wiz_0/clk_in1]
    connect_bd_net $reset_n [get_bd_pins clk_wiz_0/resetn]
    connect_bd_net [get_bd_pins clk_wiz_0/clk_out2] $eth_ref_clk
    set system_clock_pin [get_bd_pins clk_wiz_0/clk_out1]
    set microblaze_clock {/clk_wiz_0/clk_out1 (100 MHz)}
    set microblaze_cache {None}
} else {
    set mig [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:mig_7series:*"] mig_7series_0]
    apply_board_connection -board_interface "ddr3_sdram" \
        -ip_intf "mig_7series_0/mig_ddr_interface" -diagram $design_name

    # The Arty MIG preset exposes its 200MHz IDELAY reference as a no-buffer
    # input. Feed it from the MIG auxiliary MMCM output instead of consuming
    # another board pin.
    set mig_ref_clk_port [get_bd_ports -quiet clk_ref_i]
    if {$mig_ref_clk_port ne ""} {
        foreach existing_net [get_bd_nets -quiet -of_objects $mig_ref_clk_port] {
            disconnect_bd_net $existing_net $mig_ref_clk_port
        }
        delete_bd_objs $mig_ref_clk_port
    }
    connect_bd_net [get_bd_pins mig_7series_0/ui_addn_clk_0] [get_bd_pins mig_7series_0/clk_ref_i]
    set_property CONFIG.FREQ_HZ 100000000 [get_bd_ports sys_clk_i]

    set system_clk_wiz [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:clk_wiz:*"] system_clk_wiz]
    set_property -dict [list \
        CONFIG.PRIM_IN_FREQ {199.692308} \
        CONFIG.PRIM_SOURCE {No_buffer} \
        CONFIG.CLKOUT1_REQUESTED_OUT_FREQ {25.000} \
        CONFIG.CLKOUT2_USED {true} \
        CONFIG.CLKOUT2_REQUESTED_OUT_FREQ {100.000} \
        CONFIG.NUM_OUT_CLKS {2} \
        CONFIG.RESET_TYPE {ACTIVE_HIGH} \
        CONFIG.RESET_PORT {reset}] $system_clk_wiz
    connect_bd_net [get_bd_pins mig_7series_0/ui_addn_clk_0] [get_bd_pins system_clk_wiz/clk_in1]
    connect_bd_net [get_bd_pins mig_7series_0/ui_clk_sync_rst] [get_bd_pins system_clk_wiz/reset]
    connect_bd_net [get_bd_pins system_clk_wiz/clk_out1] $eth_ref_clk
    set_property CONFIG.FREQ_HZ \
        [get_property CONFIG.FREQ_HZ [get_bd_pins system_clk_wiz/clk_out1]] $eth_ref_clk
    set system_clock_pin [get_bd_pins system_clk_wiz/clk_out2]
    set microblaze_clock {/system_clk_wiz/clk_out2 (100 MHz)}
    set microblaze_cache {32KB}
}

set microblaze [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:microblaze:*"] microblaze_0]
apply_bd_automation -rule xilinx.com:bd_rule:microblaze -config [list \
    axi_intc {1} \
    axi_periph {Enabled} \
    cache $microblaze_cache \
    clk $microblaze_clock \
    debug_module {Debug Only} \
    ecc {None} \
    local_mem {128KB} \
    preset {None}] $microblaze

# Vivado 2025.2 automation accepts at most 128KB, but supports resizing the
# generated local memory through its D/I LMB address segments afterward.
if {$memory_profile eq "bram"} {
    foreach side [list D I] {
        foreach lmb_segment [get_bd_addr_segs -of_objects [get_bd_intf_pins microblaze_0/${side}LMB]] {
            set_property offset 0x00000000 $lmb_segment
            set_property range 0x00040000 $lmb_segment
        }
    }
}

if {$memory_profile eq "ddr"} {
    apply_bd_automation -rule xilinx.com:bd_rule:axi4 -config [list \
        Clk_master {/system_clk_wiz/clk_out2 (100 MHz)} \
        Clk_slave {Auto} \
        Clk_xbar {Auto} \
        Master {/microblaze_0 (Cached)} \
        Slave {/mig_7series_0/S_AXI} \
        ddr_seg {Auto} \
        intc_ip {New AXI SmartConnect} \
        master_apm {0}] [get_bd_intf_pins mig_7series_0/S_AXI]
    apply_bd_automation -rule xilinx.com:bd_rule:board -config [list \
        Board_Interface {reset ( FPGA Reset )} \
        Manual_Source {Auto}] [get_bd_pins mig_7series_0/sys_rst]
}

set reset_cells [get_bd_cells -quiet -filter {VLNV =~ "xilinx.com:ip:proc_sys_reset:*"}]
foreach reset_cell $reset_cells {
    set ext_reset_pin [get_bd_pins -quiet $reset_cell/ext_reset_in]
    foreach existing_net [get_bd_nets -quiet -of_objects $ext_reset_pin] {
        disconnect_bd_net $existing_net $ext_reset_pin
    }
    if {$memory_profile eq "bram"} {
        set_property CONFIG.C_EXT_RESET_HIGH 0 $reset_cell
        connect_bd_net $reset_n $ext_reset_pin
    } else {
        connect_bd_net [get_bd_pins mig_7series_0/ui_clk_sync_rst] $ext_reset_pin
    }
    set dcm_locked_pin [get_bd_pins -quiet $reset_cell/dcm_locked]
    if {[llength [get_bd_nets -quiet -of_objects $dcm_locked_pin]] == 0} {
        if {$memory_profile eq "bram"} {
            connect_bd_net [get_bd_pins clk_wiz_0/locked] $dcm_locked_pin
        } else {
            connect_bd_net [get_bd_pins system_clk_wiz/locked] $dcm_locked_pin
        }
    }
    set sync_clk_pin [get_bd_pins -quiet $reset_cell/slowest_sync_clk]
    if {[llength [get_bd_nets -quiet -of_objects $sync_clk_pin]] == 0} {
        connect_bd_net $system_clock_pin $sync_clk_pin
    }
}
foreach generated_reset [get_bd_ports -quiet reset*] {
    if {$memory_profile eq "bram" && $generated_reset ne $reset_n} {
        delete_bd_objs $generated_reset
    }
}

set ethernet [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:axi_ethernetlite:*"] axi_ethernetlite_0]
set_property -dict [list \
    CONFIG.C_INCLUDE_INTERNAL_LOOPBACK {0} \
    CONFIG.C_INCLUDE_MDIO {1} \
    CONFIG.C_RX_PING_PONG {1} \
    CONFIG.C_TX_PING_PONG {1}] $ethernet
apply_board_connection -board_interface "eth_mii" -ip_intf "axi_ethernetlite_0/MII" -diagram $design_name
apply_board_connection -board_interface "eth_mdio_mdc" -ip_intf "axi_ethernetlite_0/MDIO" -diagram $design_name

set timer [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:axi_timer:*"] axi_timer_0]
set_property -dict [list CONFIG.enable_timer2 {0}] $timer

set uart [create_bd_cell -type ip -vlnv [latest_ip "xilinx.com:ip:axi_uartlite:*"] axi_uartlite_0]
set_property CONFIG.C_BAUDRATE 115200 $uart
apply_board_connection -board_interface "usb_uart" -ip_intf "axi_uartlite_0/UART" -diagram $design_name

set motion [create_bd_cell -type ip -vlnv [latest_ip "risk-zero.local:user:risk_zero_motion:*"] risk_zero_motion_0]

set peripheral_interconnect ""
foreach candidate [get_bd_cells -quiet -filter {NAME =~ "*axi_periph*"}] {
    set candidate_vlnv [get_property VLNV $candidate]
    if {[string match "xilinx.com:ip:axi_interconnect:*" $candidate_vlnv] ||
        [string match "xilinx.com:ip:smartconnect:*" $candidate_vlnv]} {
        set peripheral_interconnect $candidate
        break
    }
}
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
if {$memory_profile eq "ddr"} {
    set system_reset_cell [lindex [get_bd_cells -quiet -filter {
        VLNV =~ "xilinx.com:ip:proc_sys_reset:*" && NAME =~ "*system_clk_wiz*"
    }] 0]
    set system_reset_pin [get_bd_pins -quiet $system_reset_cell/peripheral_aresetn]
} else {
    set system_reset_pin [lindex [get_bd_pins -quiet -of_objects $reset_cells -filter {NAME =~ "*peripheral_aresetn"}] 0]
}
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
    set master_clock_pin [get_bd_pins -quiet $peripheral_interconnect/${master_name}_ACLK]
    if {$master_clock_pin ne "" && [llength [get_bd_nets -quiet -of_objects $master_clock_pin]] == 0} {
        connect_bd_net $system_clock_pin $master_clock_pin
    }
    set master_reset_pin [get_bd_pins -quiet $peripheral_interconnect/${master_name}_ARESETN]
    if {$master_reset_pin ne "" && [llength [get_bd_nets -quiet -of_objects $master_reset_pin]] == 0} {
        connect_bd_net $system_reset_pin $master_reset_pin
    }
}

foreach {pin_name signal_pin} [list aclk $system_clock_pin aresetn $system_reset_pin] {
    set shared_pin [get_bd_pins -quiet $peripheral_interconnect/$pin_name]
    if {$shared_pin ne "" && [llength [get_bd_nets -quiet -of_objects $shared_pin]] == 0} {
        connect_bd_net $signal_pin $shared_pin
    }
}

foreach peripheral [list axi_ethernetlite_0 axi_timer_0 risk_zero_motion_0 axi_uartlite_0] {
    connect_bd_net $system_clock_pin [get_bd_pins $peripheral/s_axi_aclk]
    connect_bd_net $system_reset_pin [get_bd_pins $peripheral/s_axi_aresetn]
}

set interrupt_controller [lindex [get_bd_cells -quiet -filter {VLNV =~ "xilinx.com:ip:axi_intc:*"}] 0]
if {$interrupt_controller eq ""} {
    error "MicroBlaze interrupt controller is missing."
}
set interrupt_concat [lindex [get_bd_cells -quiet -filter {
    VLNV =~ "*:xlconcat:*" || VLNV =~ "*:ilconcat:*"
}] 0]
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
add_files -norecurse [list $wrapper]
set_property top ${design_name}_wrapper [get_filesets sources_1]
update_compile_order -fileset sources_1
close_project

puts "RISK-ZERO [string toupper $memory_profile] bring-up project created: $project_dir"
puts "Target: $expected_part / board $board_part"
if {$memory_profile eq "bram"} {
    puts "Profile: MicroBlaze 100MHz, 256KB LMB, EthernetLite MII, UARTLite, AXI timer, motion IP"
    puts "Next: source vivado/build_arty_system.tcl"
} else {
    puts "Profile: MicroBlaze 100MHz, 32KB caches, DDR3L, EthernetLite MII, UARTLite, AXI timer, motion IP"
    puts "Next: source vivado/build_arty_ddr_system.tcl"
}
