set script_dir [file dirname [file normalize [info script]]]
set package_dir [file normalize "$script_dir/../build/ip-repository/risk_zero_motion_1_0"]
set rtl_dir [file normalize "$script_dir/../rtl"]

create_project package_risk_zero_motion [file normalize "$script_dir/../build/package-project"] -part xc7a100tcsg324-1 -force
add_files [glob "$rtl_dir/*.sv"]
set_property top risk_zero_motion_axi_lite [get_filesets sources_1]
update_compile_order -fileset sources_1

ipx::package_project -root_dir $package_dir -vendor risk-zero.local -library user -taxonomy /UserIP -import_files -set_current true
set core [ipx::current_core]
set_property name risk_zero_motion $core
set_property display_name "RISK-ZERO Motion Accumulator" $core
set_property description "160x120 GRAY8 frame difference and centroid accumulator" $core
set_property version 1.0 $core
set bus_interface [ipx::get_bus_interfaces s_axi -of_objects $core]
if {[llength $bus_interface] == 0} {
    error "AXI4-Lite interface inference failed for risk_zero_motion"
}
set memory_map [ipx::get_memory_maps s_axi -of_objects $core]
if {[llength $memory_map] == 0} {
    set memory_map [ipx::add_memory_map s_axi $core]
    set address_block [ipx::add_address_block registers $memory_map]
    set_property range 4096 $address_block
    set_property width 32 $address_block
    set_property usage register $address_block
    set_property slave_memory_map_ref s_axi $bus_interface
}
ipx::create_xgui_files $core
ipx::update_checksums $core
ipx::save_core $core

puts "Packaged IP: $package_dir"
