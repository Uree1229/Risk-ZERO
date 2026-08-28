`timescale 1ns / 1ps

module tb_risk_zero_camera_dvp_rx;
    localparam integer FRAME_WIDTH = 4;
    localparam integer FRAME_HEIGHT = 3;

    reg cam_pclk = 0;
    reg resetn = 0;
    reg vision_enable = 0;
    reg [7:0] cam_data = 0;
    reg cam_vsync = 0;
    reg cam_href = 0;

    wire frame_start;
    wire frame_end;
    wire pixel_valid;
    wire [7:0] pixel_data;
    wire [15:0] pixel_x;
    wire [15:0] pixel_y;
    wire frame_geometry_valid;
    wire geometry_error;
    wire [31:0] frame_counter;

    integer x;
    integer y;
    integer expected_value;

    always #5 cam_pclk = ~cam_pclk;

    risk_zero_camera_dvp_rx #(
        .FRAME_WIDTH(FRAME_WIDTH),
        .FRAME_HEIGHT(FRAME_HEIGHT)
    ) dut (
        .cam_pclk(cam_pclk),
        .resetn(resetn),
        .vision_enable(vision_enable),
        .cam_data(cam_data),
        .cam_vsync(cam_vsync),
        .cam_href(cam_href),
        .frame_start(frame_start),
        .frame_end(frame_end),
        .pixel_valid(pixel_valid),
        .pixel_data(pixel_data),
        .pixel_x(pixel_x),
        .pixel_y(pixel_y),
        .frame_geometry_valid(frame_geometry_valid),
        .geometry_error(geometry_error),
        .frame_counter(frame_counter)
    );

    task start_frame;
        input expect_previous_valid;
        input expect_previous_error;
        begin
            cam_href = 0;
            cam_vsync = 1;
            @(posedge cam_pclk);
            #1;
            if (!frame_start)
                $fatal(1, "VSYNC did not create frame_start");
            if (expect_previous_valid &&
                (!frame_end || !frame_geometry_valid || geometry_error))
                $fatal(1, "valid frame geometry was not accepted");
            if (expect_previous_error &&
                (!frame_end || frame_geometry_valid || !geometry_error))
                $fatal(1, "malformed frame geometry was not rejected");
            cam_vsync = 0;
            @(posedge cam_pclk);
            #1;
        end
    endtask

    task send_valid_frame;
        begin
            expected_value = 0;
            for (y = 0; y < FRAME_HEIGHT; y = y + 1) begin
                cam_href = 1;
                for (x = 0; x < FRAME_WIDTH; x = x + 1) begin
                    cam_data = expected_value[7:0];
                    @(posedge cam_pclk);
                    #1;
                    if (!pixel_valid || pixel_x != x || pixel_y != y ||
                        pixel_data != expected_value[7:0])
                        $fatal(1, "pixel mismatch at (%0d,%0d)", x, y);
                    expected_value = expected_value + 1;
                end
                cam_href = 0;
                @(posedge cam_pclk);
                #1;
            end
        end
    endtask

    task send_short_frame;
        begin
            for (y = 0; y < FRAME_HEIGHT; y = y + 1) begin
                cam_href = 1;
                for (x = 0; x < FRAME_WIDTH - 1; x = x + 1) begin
                    cam_data = 8'h55;
                    @(posedge cam_pclk);
                    #1;
                end
                cam_href = 0;
                @(posedge cam_pclk);
                #1;
            end
        end
    endtask

    initial begin
        repeat (3) @(posedge cam_pclk);
        resetn = 1;
        vision_enable = 1;
        repeat (2) @(posedge cam_pclk);

        start_frame(0, 0);
        send_valid_frame();
        start_frame(1, 0);
        if (frame_counter != 1)
            $fatal(1, "completed frame counter did not increment");

        send_short_frame();
        start_frame(0, 1);
        if (frame_counter != 2)
            $fatal(1, "malformed frame was not counted as completed");

        vision_enable = 0;
        cam_vsync = 0;
        cam_href = 1;
        cam_data = 8'hAA;
        @(posedge cam_pclk);
        #1;
        if (pixel_valid)
            $fatal(1, "disabled Vision Domain accepted a pixel");

        $display("PASS: risk_zero_camera_dvp_rx");
        $finish;
    end
endmodule
