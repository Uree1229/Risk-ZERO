set script_dir [file dirname [file normalize [info script]]]
set rtl_dir [file normalize "$script_dir/../rtl"]
set report_dir [file normalize "$script_dir/../build/camera-primitive-synth"]

file mkdir $report_dir
create_project -in_memory -part xc7a100tcsg324-1
set_property target_language Verilog [current_project]
read_verilog -sv [glob "$rtl_dir/*.sv"]

foreach top_module {
    risk_zero_sccb_master
    risk_zero_ov7670_id_probe
    risk_zero_camera_yuv422_y_extract
    risk_zero_async_fifo
} {
    puts "Synthesizing $top_module"
    synth_design -top $top_module -part xc7a100tcsg324-1 -mode out_of_context
    report_utilization -file [file join $report_dir "${top_module}_utilization.rpt"]
    puts "PASS: synthesized $top_module"
    close_design
}

close_project
puts "PASS: all camera primitives synthesized for xc7a100tcsg324-1"
