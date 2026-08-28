`timescale 1ns / 1ps

// Generic Parallel DVP byte receiver in the camera PCLK domain.
//
// The selected camera model and output format are intentionally not fixed.
// This block assumes that one active HREF clock contains one GRAY8 byte. A
// YUV/RGB camera must add a format-unpack/grayscale stage after this receiver.
// Pixel data must cross into another processing clock through an asynchronous
// FIFO; this module does not treat the multi-bit camera bus as ordinary GPIO.
module risk_zero_camera_dvp_rx #(
    parameter integer FRAME_WIDTH = 160,
    parameter integer FRAME_HEIGHT = 120,
    parameter integer FRAME_PIXELS = FRAME_WIDTH * FRAME_HEIGHT,
    parameter integer VSYNC_ACTIVE_HIGH = 1,
    parameter integer HREF_ACTIVE_HIGH = 1
) (
    input  wire        cam_pclk,
    input  wire        resetn,
    input  wire        vision_enable,
    input  wire [7:0]  cam_data,
    input  wire        cam_vsync,
    input  wire        cam_href,

    output reg         frame_start,
    output reg         frame_end,
    output reg         pixel_valid,
    output reg  [7:0]  pixel_data,
    output reg  [15:0] pixel_x,
    output reg  [15:0] pixel_y,
    output reg         frame_geometry_valid,
    output reg         geometry_error,
    output reg  [31:0] frame_counter
);

    wire vsync_active = VSYNC_ACTIVE_HIGH ? cam_vsync : ~cam_vsync;
    wire href_active = HREF_ACTIVE_HIGH ? cam_href : ~cam_href;

    reg vsync_active_d;
    reg href_active_d;
    reg frame_active;
    reg [31:0] frame_pixel_count;
    reg [15:0] frame_line_count;
    reg [15:0] line_pixel_count;
    reg frame_shape_error;

    wire vsync_start = vsync_active && !vsync_active_d;
    wire href_start = href_active && !href_active_d;
    wire href_end = !href_active && href_active_d;

    always @(posedge cam_pclk) begin
        if (!resetn) begin
            vsync_active_d <= 0;
            href_active_d <= 0;
            frame_active <= 0;
            frame_pixel_count <= 0;
            frame_line_count <= 0;
            line_pixel_count <= 0;
            frame_shape_error <= 0;
            frame_start <= 0;
            frame_end <= 0;
            pixel_valid <= 0;
            pixel_data <= 0;
            pixel_x <= 0;
            pixel_y <= 0;
            frame_geometry_valid <= 0;
            geometry_error <= 0;
            frame_counter <= 0;
        end else begin
            vsync_active_d <= vsync_active;
            href_active_d <= href_active;
            frame_start <= 0;
            frame_end <= 0;
            pixel_valid <= 0;
            frame_geometry_valid <= 0;

            if (!vision_enable) begin
                frame_active <= 0;
                frame_pixel_count <= 0;
                frame_line_count <= 0;
                line_pixel_count <= 0;
                frame_shape_error <= 0;
                geometry_error <= 0;
                pixel_x <= 0;
                pixel_y <= 0;
            end else if (vsync_start) begin
                frame_start <= 1;
                if (frame_active) begin
                    frame_end <= 1;
                    frame_counter <= frame_counter + 1'b1;
                    if (frame_pixel_count == FRAME_PIXELS &&
                        frame_line_count == FRAME_HEIGHT &&
                        !frame_shape_error && !href_active) begin
                        frame_geometry_valid <= 1;
                        geometry_error <= 0;
                    end else begin
                        geometry_error <= 1;
                    end
                end

                frame_active <= 1;
                frame_pixel_count <= 0;
                frame_line_count <= 0;
                line_pixel_count <= 0;
                frame_shape_error <= 0;
                pixel_x <= 0;
                pixel_y <= 0;
            end else if (frame_active && !vsync_active) begin
                if (href_start) begin
                    line_pixel_count <= 0;
                    pixel_x <= 0;
                end

                if (href_active) begin
                    pixel_valid <= 1;
                    pixel_data <= cam_data;
                    pixel_x <= line_pixel_count;
                    pixel_y <= frame_line_count;
                    frame_pixel_count <= frame_pixel_count + 1'b1;
                    line_pixel_count <= line_pixel_count + 1'b1;
                end

                if (href_end) begin
                    if (line_pixel_count != FRAME_WIDTH)
                        frame_shape_error <= 1;
                    frame_line_count <= frame_line_count + 1'b1;
                    line_pixel_count <= 0;
                    pixel_x <= 0;
                    pixel_y <= frame_line_count + 1'b1;
                end
            end
        end
    end
endmodule
