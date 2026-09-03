`timescale 1ns / 1ps

// Selects the luminance byte from a YUV422 DVP byte stream. Y_BYTE_PHASE is
// intentionally parameterized because the physical byte order depends on the
// camera register configuration and must be confirmed with real DVP capture.
module risk_zero_camera_yuv422_y_extract #(
    parameter integer Y_BYTE_PHASE = 0
) (
    input  wire        cam_pclk,
    input  wire        resetn,
    input  wire        byte_valid,
    input  wire [7:0]  byte_data,
    input  wire [15:0] byte_x,
    input  wire [15:0] line_y,

    output reg         gray_valid,
    output reg  [7:0]  gray_data,
    output reg  [15:0] pixel_x,
    output reg  [15:0] pixel_y
);

    initial begin
        if (Y_BYTE_PHASE != 0 && Y_BYTE_PHASE != 1)
            $error("Y_BYTE_PHASE must be zero or one");
    end

    always @(posedge cam_pclk) begin
        if (!resetn) begin
            gray_valid <= 0;
            gray_data <= 0;
            pixel_x <= 0;
            pixel_y <= 0;
        end else begin
            gray_valid <= 0;
            if (byte_valid && byte_x[0] == Y_BYTE_PHASE[0]) begin
                gray_valid <= 1;
                gray_data <= byte_data;
                pixel_x <= byte_x >> 1;
                pixel_y <= line_y;
            end
        end
    end

endmodule
