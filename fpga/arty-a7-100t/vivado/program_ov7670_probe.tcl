if {$argc > 0} {
    # An explicit path avoids Windows known-folder normalization surprises.
    set bitstream_file [lindex $argv 0]
} else {
    set script_dir [file dirname [file normalize [info script]]]
    set fpga_dir [file normalize "$script_dir/.."]
    set bitstream_file [file normalize "$fpga_dir/build/ov7670-probe/risk_zero_ov7670_probe.bit"]
}

if {![file exists $bitstream_file]} {
    error "OV7670 probe bitstream is missing: $bitstream_file"
}

open_hw_manager
connect_hw_server -allow_non_jtag
open_hw_target

set arty_devices [get_hw_devices -quiet -filter {PART =~ "xc7a100t*"}]
if {[llength $arty_devices] != 1} {
    error "Expected exactly one xc7a100t device, found [llength $arty_devices]: $arty_devices"
}

set device [lindex $arty_devices 0]
current_hw_device $device
refresh_hw_device $device
set_property PROGRAM.FILE $bitstream_file $device
program_hw_devices $device
refresh_hw_device $device

set program_file [get_property PROGRAM.FILE $device]
puts "PASS: programmed [get_property PART $device]"
puts "PROGRAM.FILE: $program_file"
puts "Observe LD4=ready, LD5=PID 0xFF, LD6=PID 0x00, LD7=other mismatch/timeout."

close_hw_target
disconnect_hw_server
close_hw_manager
