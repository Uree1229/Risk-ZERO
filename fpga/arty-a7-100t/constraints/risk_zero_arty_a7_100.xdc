## RISK-ZERO ports not covered by the Digilent board-interface flow.
## Arty A7-100 Rev. D/E, XC7A100TCSG324-1.

set_property -dict { PACKAGE_PIN E3 IOSTANDARD LVCMOS33 } [get_ports { CLK100MHZ }]
create_clock -add -name sys_clk_pin -period 10.000 -waveform {0.000 5.000} [get_ports { CLK100MHZ }]

set_property -dict { PACKAGE_PIN C2 IOSTANDARD LVCMOS33 } [get_ports { ck_rst }]
set_property PULLUP true [get_ports { ck_rst }]

set_property -dict { PACKAGE_PIN G18 IOSTANDARD LVCMOS33 SLEW SLOW DRIVE 8 } [get_ports { eth_ref_clk }]
