## RISK-ZERO DDR3L profile port not covered by the Digilent board flow.
## The board preset supplies the DDR3L, 100MHz clock, and reset constraints.

## The Digilent MIG preset emits LVCMOS25 for E3, but the Arty oscillator and
## bank 35 are 3.3V. Override it after the generated MIG constraints.
set_property IOSTANDARD LVCMOS33 [get_ports { sys_clk_i }]
set_property -dict { PACKAGE_PIN G18 IOSTANDARD LVCMOS33 SLEW SLOW DRIVE 8 } [get_ports { eth_ref_clk }]
