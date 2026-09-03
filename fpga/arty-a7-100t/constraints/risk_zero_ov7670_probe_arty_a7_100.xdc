## Minimal OV7670 ID probe for Digilent Arty A7-100T Rev. D/E.
## External resistor networks are mandatory; see DIRECT_CAMERA_BRINGUP.md.

set_property -dict { PACKAGE_PIN E3 IOSTANDARD LVCMOS33 } [get_ports { clk100mhz }]
create_clock -add -name sys_clk_pin -period 10.000 -waveform {0.000 5.000} [get_ports { clk100mhz }]

set_property -dict { PACKAGE_PIN D9 IOSTANDARD LVCMOS33 } [get_ports { btn_reset }]

set_property -dict { PACKAGE_PIN G13 IOSTANDARD LVCMOS33 DRIVE 4 SLEW FAST } [get_ports { cam_xclk }]
set_property -dict { PACKAGE_PIN B11 IOSTANDARD LVCMOS33 DRIVE 4 SLEW SLOW } [get_ports { cam_sioc }]
set_property -dict { PACKAGE_PIN A11 IOSTANDARD LVCMOS33 DRIVE 4 SLEW SLOW } [get_ports { cam_siod }]

set_property -dict { PACKAGE_PIN H5 IOSTANDARD LVCMOS33 } [get_ports { led[0] }]
set_property -dict { PACKAGE_PIN J5 IOSTANDARD LVCMOS33 } [get_ports { led[1] }]
set_property -dict { PACKAGE_PIN T9 IOSTANDARD LVCMOS33 } [get_ports { led[2] }]
set_property -dict { PACKAGE_PIN T10 IOSTANDARD LVCMOS33 } [get_ports { led[3] }]
