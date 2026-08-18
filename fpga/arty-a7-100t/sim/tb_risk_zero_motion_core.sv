`timescale 1ns / 1ps

module tb_risk_zero_motion_core;
    localparam integer WIDTH = 8;
    localparam integer HEIGHT = 6;
    localparam integer PIXELS = WIDTH * HEIGHT;

    reg clk = 0;
    reg resetn = 0;
    reg frame_start = 0;
    reg background_reset = 0;
    reg pixel_valid = 0;
    reg [7:0] pixel_data = 0;
    reg [7:0] threshold = 8'd20;
    wire result_valid;
    wire background_ready;
    wire [31:0] motion_count;
    wire [31:0] sum_x;
    wire [31:0] sum_y;
    wire [7:0] min_x;
    wire [7:0] max_x;
    wire [7:0] min_y;
    wire [7:0] max_y;

    reg [7:0] frame [0:PIXELS-1];
    integer index;

    always #5 clk = ~clk;

    risk_zero_motion_core #(
        .FRAME_WIDTH(WIDTH),
        .FRAME_HEIGHT(HEIGHT)
    ) dut (
        .clk(clk),
        .resetn(resetn),
        .frame_start(frame_start),
        .background_reset(background_reset),
        .pixel_valid(pixel_valid),
        .pixel_data(pixel_data),
        .threshold(threshold),
        .result_valid(result_valid),
        .background_ready(background_ready),
        .motion_count(motion_count),
        .sum_x(sum_x),
        .sum_y(sum_y),
        .min_x(min_x),
        .max_x(max_x),
        .min_y(min_y),
        .max_y(max_y)
    );

    task send_frame;
        begin
            @(posedge clk);
            frame_start <= 1;
            @(posedge clk);
            frame_start <= 0;
            for (index = 0; index < PIXELS; index = index + 1) begin
                pixel_data <= frame[index];
                pixel_valid <= 1;
                @(posedge clk);
            end
            pixel_valid <= 0;
            wait(result_valid == 1);
            @(posedge clk);
        end
    endtask

    initial begin
        for (index = 0; index < PIXELS; index = index + 1) frame[index] = 8'd10;
        repeat (4) @(posedge clk);
        resetn <= 1;

        send_frame();
        if (!background_ready || motion_count != 0) $fatal(1, "background initialization failed");

        frame[1 * WIDTH + 2] = 8'd100;
        frame[1 * WIDTH + 3] = 8'd100;
        frame[2 * WIDTH + 2] = 8'd100;
        frame[2 * WIDTH + 3] = 8'd100;
        send_frame();
        if (motion_count != 4) $fatal(1, "motion_count expected 4, got %0d", motion_count);
        if (sum_x != 10 || sum_y != 6) $fatal(1, "centroid sums incorrect");
        if (min_x != 2 || max_x != 3 || min_y != 1 || max_y != 2) $fatal(1, "bbox incorrect");

        send_frame();
        if (motion_count != 4) $fatal(1, "stationary foreground should remain visible");

        $display("PASS: risk_zero_motion_core");
        $finish;
    end
endmodule
