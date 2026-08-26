`timescale 1ns / 1ps

module risk_zero_motion_core #(
    parameter integer FRAME_WIDTH = 160,
    parameter integer FRAME_HEIGHT = 120,
    parameter integer FRAME_PIXELS = FRAME_WIDTH * FRAME_HEIGHT,
    parameter integer INDEX_WIDTH = $clog2(FRAME_PIXELS)
) (
    input  wire        clk,
    input  wire        resetn,
    input  wire        frame_start,
    input  wire        background_reset,
    input  wire        pixel_valid,
    input  wire [7:0]  pixel_data,
    input  wire [7:0]  threshold,
    output reg         result_valid,
    output reg         background_ready,
    output reg  [31:0] motion_count,
    output reg  [31:0] sum_x,
    output reg  [31:0] sum_y,
    output reg  [7:0]  min_x,
    output reg  [7:0]  max_x,
    output reg  [7:0]  min_y,
    output reg  [7:0]  max_y
);

    reg [7:0] background_frame [0:FRAME_PIXELS-1];
    reg [INDEX_WIDTH-1:0] input_index;
    reg [7:0] input_x;
    reg [7:0] input_y;

    reg pipeline_valid;
    reg pipeline_last;
    reg [INDEX_WIDTH-1:0] pipeline_index;
    reg [7:0] pipeline_current;
    reg [7:0] pipeline_previous;
    reg [7:0] pipeline_x;
    reg [7:0] pipeline_y;

    reg difference_valid;
    reg difference_last;
    reg [INDEX_WIDTH-1:0] difference_index;
    reg [7:0] difference_current;
    reg [8:0] difference_value;
    reg [7:0] difference_x;
    reg [7:0] difference_y;

    reg motion_valid;
    reg motion_last;
    reg [INDEX_WIDTH-1:0] motion_index;
    reg [7:0] motion_current;
    reg motion_detected;
    reg [7:0] motion_x;
    reg [7:0] motion_y;

    reg [31:0] count_accumulator;
    reg [31:0] sum_x_accumulator;
    reg [31:0] sum_y_accumulator;
    reg [7:0] min_x_accumulator;
    reg [7:0] max_x_accumulator;
    reg [7:0] min_y_accumulator;
    reg [7:0] max_y_accumulator;

    wire [8:0] absolute_difference =
        pipeline_current >= pipeline_previous
            ? pipeline_current - pipeline_previous
            : pipeline_previous - pipeline_current;
    wire detected_motion =
        difference_valid && background_ready && difference_value >= threshold;

    wire [31:0] next_count = count_accumulator + (motion_detected ? 1 : 0);
    wire [31:0] next_sum_x = sum_x_accumulator + (motion_detected ? motion_x : 0);
    wire [31:0] next_sum_y = sum_y_accumulator + (motion_detected ? motion_y : 0);
    wire [7:0] next_min_x =
        motion_detected && motion_x < min_x_accumulator ? motion_x : min_x_accumulator;
    wire [7:0] next_max_x =
        motion_detected && motion_x > max_x_accumulator ? motion_x : max_x_accumulator;
    wire [7:0] next_min_y =
        motion_detected && motion_y < min_y_accumulator ? motion_y : min_y_accumulator;
    wire [7:0] next_max_y =
        motion_detected && motion_y > max_y_accumulator ? motion_y : max_y_accumulator;
    wire next_count_nonzero = |count_accumulator || motion_detected;

    always @(posedge clk) begin
        if (!resetn) begin
            input_index <= 0;
            input_x <= 0;
            input_y <= 0;
            pipeline_valid <= 0;
            pipeline_last <= 0;
            difference_valid <= 0;
            difference_last <= 0;
            difference_index <= 0;
            difference_current <= 0;
            difference_value <= 0;
            difference_x <= 0;
            difference_y <= 0;
            motion_valid <= 0;
            motion_last <= 0;
            motion_index <= 0;
            motion_current <= 0;
            motion_detected <= 0;
            motion_x <= 0;
            motion_y <= 0;
            result_valid <= 0;
            background_ready <= 0;
            count_accumulator <= 0;
            sum_x_accumulator <= 0;
            sum_y_accumulator <= 0;
            min_x_accumulator <= 8'hff;
            max_x_accumulator <= 0;
            min_y_accumulator <= 8'hff;
            max_y_accumulator <= 0;
            motion_count <= 0;
            sum_x <= 0;
            sum_y <= 0;
            min_x <= 0;
            max_x <= 0;
            min_y <= 0;
            max_y <= 0;
        end else begin
            result_valid <= 0;

            if (background_reset) begin
                background_ready <= 0;
            end

            if (frame_start) begin
                input_index <= 0;
                input_x <= 0;
                input_y <= 0;
                pipeline_valid <= 0;
                difference_valid <= 0;
                motion_valid <= 0;
                count_accumulator <= 0;
                sum_x_accumulator <= 0;
                sum_y_accumulator <= 0;
                min_x_accumulator <= 8'hff;
                max_x_accumulator <= 0;
                min_y_accumulator <= 8'hff;
                max_y_accumulator <= 0;
            end

            if (pixel_valid) begin
                pipeline_valid <= 1;
                pipeline_last <= input_index == FRAME_PIXELS - 1;
                pipeline_index <= input_index;
                pipeline_current <= pixel_data;
                pipeline_previous <= background_frame[input_index];
                pipeline_x <= input_x;
                pipeline_y <= input_y;

                if (input_index == FRAME_PIXELS - 1) begin
                    input_index <= 0;
                    input_x <= 0;
                    input_y <= 0;
                end else begin
                    input_index <= input_index + 1'b1;
                    if (input_x == FRAME_WIDTH - 1) begin
                        input_x <= 0;
                        input_y <= input_y + 1'b1;
                    end else begin
                        input_x <= input_x + 1'b1;
                    end
                end
            end else begin
                pipeline_valid <= 0;
            end

            if (pipeline_valid) begin
                difference_valid <= 1;
                difference_last <= pipeline_last;
                difference_index <= pipeline_index;
                difference_current <= pipeline_current;
                difference_value <= absolute_difference;
                difference_x <= pipeline_x;
                difference_y <= pipeline_y;
            end else begin
                difference_valid <= 0;
            end

            if (difference_valid) begin
                motion_valid <= 1;
                motion_last <= difference_last;
                motion_index <= difference_index;
                motion_current <= difference_current;
                motion_detected <= detected_motion;
                motion_x <= difference_x;
                motion_y <= difference_y;
            end else begin
                motion_valid <= 0;
            end

            if (motion_valid) begin
                // Do not absorb foreground pixels into the background. This
                // keeps a stopped foreground candidate visible across frames.
                if (!background_ready || !motion_detected) begin
                    background_frame[motion_index] <= motion_current;
                end
                count_accumulator <= next_count;
                sum_x_accumulator <= next_sum_x;
                sum_y_accumulator <= next_sum_y;
                min_x_accumulator <= next_min_x;
                max_x_accumulator <= next_max_x;
                min_y_accumulator <= next_min_y;
                max_y_accumulator <= next_max_y;

                if (motion_last) begin
                    result_valid <= 1;
                    if (!background_ready) begin
                        background_ready <= 1;
                        motion_count <= 0;
                        sum_x <= 0;
                        sum_y <= 0;
                        min_x <= 0;
                        max_x <= 0;
                        min_y <= 0;
                        max_y <= 0;
                    end else begin
                        motion_count <= next_count;
                        sum_x <= next_sum_x;
                        sum_y <= next_sum_y;
                        min_x <= next_count_nonzero ? next_min_x : 0;
                        max_x <= next_count_nonzero ? next_max_x : 0;
                        min_y <= next_count_nonzero ? next_min_y : 0;
                        max_y <= next_count_nonzero ? next_max_y : 0;
                    end
                end
            end
        end
    end
endmodule
