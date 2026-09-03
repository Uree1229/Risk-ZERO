`timescale 1ns / 1ps

// Minimal Arty A7-100T hardware probe for a FIFO-less OV7670 module.
//
// This top intentionally exposes only XCLK and SCCB. It does not configure
// image format registers or connect the DVP pixel bus. BTN0 restarts the
// power-on delay and probe. On failure the LEDs classify the sampled PID:
// LED1=0xFF (SDA stayed high), LED2=0x00 (SDA stayed low),
// LED3=another ID mismatch or an internal controller timeout.
module risk_zero_ov7670_probe_top (
    input  wire       clk100mhz,
    input  wire       btn_reset,
    output wire       cam_xclk,
    output wire       cam_sioc,
    inout  wire       cam_siod,
    output wire [3:0] led
);

    localparam integer POWER_ON_RESET_CYCLES = 1_000_000;

    reg [19:0] power_on_counter = 0;
    reg start_pending = 1;

    wire resetn = (power_on_counter == POWER_ON_RESET_CYCLES) &&
                  !btn_reset;
    wire probe_start = start_pending && resetn;
    wire siod_drive_low;
    wire siod_in = cam_siod;
    wire command_valid;
    wire command_ready;
    wire command_read;
    wire [7:0] register_address;
    wire [7:0] write_data;
    wire [7:0] read_data;
    wire command_done;
    wire camera_ready;
    wire id_fault;
    wire sccb_timeout_fault;
    wire probe_busy;
    wire unused_probe_done;
    wire unused_camera_fault;
    wire unused_sccb_busy;
    wire unused_ninth_bit;
    wire [7:0] camera_pid;
    wire [7:0] unused_camera_version;

    assign cam_siod = siod_drive_low ? 1'b0 : 1'bz;
    assign led[0] = camera_ready;
    assign led[1] = id_fault && (camera_pid == 8'hff);
    assign led[2] = id_fault && (camera_pid == 8'h00);
    assign led[3] = sccb_timeout_fault ||
                    (id_fault && camera_pid != 8'hff && camera_pid != 8'h00);

    always @(posedge clk100mhz) begin
        if (btn_reset) begin
            power_on_counter <= 0;
        end else if (power_on_counter != POWER_ON_RESET_CYCLES) begin
            power_on_counter <= power_on_counter + 1'b1;
        end
    end

    always @(posedge clk100mhz) begin
        if (!resetn)
            start_pending <= 1;
        else if (probe_start)
            start_pending <= 0;
    end

    // 12.5 MHz is inside the OV7670 10-48 MHz input range and gives the
    // first breadboard probe more signal-integrity margin than 25 MHz.
    risk_zero_camera_xclk #(
        .SYS_CLK_HZ(100_000_000),
        .XCLK_HZ(12_500_000)
    ) camera_xclk (
        .sys_clk(clk100mhz),
        .resetn(resetn),
        .enable(1'b1),
        .cam_xclk(cam_xclk)
    );

    risk_zero_sccb_master #(
        .SYS_CLK_HZ(100_000_000),
        .SCCB_HZ(100_000),
        .DEVICE_ADDRESS(7'h21)
    ) sccb_master (
        .clk(clk100mhz),
        .resetn(resetn),
        .command_valid(command_valid),
        .command_ready(command_ready),
        .command_read(command_read),
        .register_address(register_address),
        .write_data(write_data),
        .read_data(read_data),
        .busy(unused_sccb_busy),
        .done(command_done),
        .ninth_bit_sample(unused_ninth_bit),
        .sioc(cam_sioc),
        .siod_drive_low(siod_drive_low),
        .siod_in(siod_in)
    );

    risk_zero_ov7670_id_probe #(
        .STARTUP_CYCLES(1_000_000),
        .RESPONSE_TIMEOUT_CYCLES(2_000_000)
    ) id_probe (
        .clk(clk100mhz),
        .resetn(resetn),
        .start(probe_start),
        .clear_fault(1'b0),
        .command_valid(command_valid),
        .command_ready(command_ready),
        .command_read(command_read),
        .register_address(register_address),
        .write_data(write_data),
        .read_data(read_data),
        .command_done(command_done),
        .probe_busy(probe_busy),
        .probe_done(unused_probe_done),
        .camera_ready(camera_ready),
        .camera_fault(unused_camera_fault),
        .id_fault(id_fault),
        .sccb_timeout_fault(sccb_timeout_fault),
        .camera_pid(camera_pid),
        .camera_version(unused_camera_version)
    );

endmodule
