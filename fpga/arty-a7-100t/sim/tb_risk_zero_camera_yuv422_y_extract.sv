`timescale 1ns / 1ps

module tb_risk_zero_camera_yuv422_y_extract;
    reg cam_pclk = 0;
    reg resetn = 0;
    reg byte_valid = 0;
    reg [7:0] byte_data = 0;
    reg [15:0] byte_x = 0;
    reg [15:0] line_y = 0;

    wire even_valid;
    wire [7:0] even_data;
    wire [15:0] even_x;
    wire [15:0] even_y;
    wire odd_valid;
    wire [7:0] odd_data;
    wire [15:0] odd_x;
    wire [15:0] odd_y;

    integer even_count = 0;
    integer odd_count = 0;

    always #5 cam_pclk = ~cam_pclk;

    risk_zero_camera_yuv422_y_extract #(.Y_BYTE_PHASE(0)) even_dut (
        .cam_pclk(cam_pclk), .resetn(resetn), .byte_valid(byte_valid),
        .byte_data(byte_data), .byte_x(byte_x), .line_y(line_y),
        .gray_valid(even_valid), .gray_data(even_data),
        .pixel_x(even_x), .pixel_y(even_y)
    );

    risk_zero_camera_yuv422_y_extract #(.Y_BYTE_PHASE(1)) odd_dut (
        .cam_pclk(cam_pclk), .resetn(resetn), .byte_valid(byte_valid),
        .byte_data(byte_data), .byte_x(byte_x), .line_y(line_y),
        .gray_valid(odd_valid), .gray_data(odd_data),
        .pixel_x(odd_x), .pixel_y(odd_y)
    );

    always @(posedge cam_pclk) begin
        #1;
        if (even_valid) begin
            if (even_data != ((even_count == 0) ? 8'h11 : 8'h22) ||
                even_x != even_count || even_y != 7)
                $fatal(1, "even Y phase mismatch");
            even_count = even_count + 1;
        end
        if (odd_valid) begin
            if (odd_data != ((odd_count == 0) ? 8'hA0 : 8'hB0) ||
                odd_x != odd_count || odd_y != 7)
                $fatal(1, "odd Y phase mismatch");
            odd_count = odd_count + 1;
        end
    end

    task send_byte;
        input [15:0] x;
        input [7:0] value;
        begin
            @(negedge cam_pclk);
            byte_x = x;
            byte_data = value;
            byte_valid = 1;
            @(negedge cam_pclk);
            byte_valid = 0;
        end
    endtask

    initial begin
        repeat (3) @(posedge cam_pclk);
        resetn = 1;
        line_y = 7;
        send_byte(0, 8'h11);
        send_byte(1, 8'hA0);
        send_byte(2, 8'h22);
        send_byte(3, 8'hB0);
        repeat (2) @(posedge cam_pclk);

        if (even_count != 2 || odd_count != 2)
            $fatal(1, "Y phase counts mismatch even=%0d odd=%0d",
                   even_count, odd_count);
        $display("PASS: risk_zero_camera_yuv422_y_extract both_byte_phases");
        $finish;
    end
endmodule
