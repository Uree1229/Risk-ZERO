set expected_part "xc7a100tcsg324-1"

if {[current_project -quiet] eq ""} {
    error "Open the Arty A7-100T Vivado project before running this script."
}

set actual_part [string tolower [get_property PART [current_project]]]
if {$actual_part ne $expected_part} {
    error "Wrong FPGA part: expected $expected_part, got $actual_part"
}

set required_ip_patterns [list \
    "xilinx.com:ip:microblaze:*" \
    "xilinx.com:ip:axi_ethernetlite:*" \
    "xilinx.com:ip:mig_7series:*" \
    "xilinx.com:ip:proc_sys_reset:*"]

foreach pattern $required_ip_patterns {
    if {[llength [get_ipdefs -all $pattern]] == 0} {
        error "Required Vivado IP is unavailable: $pattern"
    }
}

puts "PASS: RISK-ZERO Vivado target is Arty A7-100T ($expected_part)."
puts "CHECK MANUALLY: 100MHz board clock, 25MHz PHY reference clock, MII pins, PHY reset, DDR3L, and linker placement."
