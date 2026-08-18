set script_dir [file dirname [file normalize [info script]]]
set project_dir [file normalize "$script_dir/../build/rtl-project"]
set rtl_dir [file normalize "$script_dir/../rtl"]
set sim_dir [file normalize "$script_dir/../sim"]

create_project risk_zero_motion $project_dir -part xc7a100tcsg324-1 -force
set_property target_language Verilog [current_project]
add_files [glob "$rtl_dir/*.sv"]
add_files -fileset sim_1 "$sim_dir/tb_risk_zero_motion_core.sv"
set_property top risk_zero_motion_axi_lite [get_filesets sources_1]
set_property top tb_risk_zero_motion_core [get_filesets sim_1]
update_compile_order -fileset sources_1
update_compile_order -fileset sim_1

puts "RISK-ZERO RTL project created at $project_dir"
puts "Run simulation with: launch_simulation"
puts "Run synthesis with: synth_design -top risk_zero_motion_axi_lite -part xc7a100tcsg324-1"
