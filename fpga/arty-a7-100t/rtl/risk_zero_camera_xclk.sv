`timescale 1ns / 1ps

// Integer clock divider for an external parallel camera XCLK input.
//
// The default 100 MHz -> 25 MHz ratio is exact on the Arty A7. Keep the
// output disabled until the camera power and I/O voltage have been verified.
// Camera pin placement and level shifting belong in the board top-level, not
// in this reusable divider.
module risk_zero_camera_xclk #(
    parameter integer SYS_CLK_HZ = 100_000_000,
    parameter integer XCLK_HZ = 25_000_000,
    parameter integer HALF_PERIOD_CYCLES = SYS_CLK_HZ / (2 * XCLK_HZ),
    parameter integer COUNTER_WIDTH =
        (HALF_PERIOD_CYCLES <= 1) ? 1 : $clog2(HALF_PERIOD_CYCLES)
) (
    input  wire sys_clk,
    input  wire resetn,
    input  wire enable,
    output reg  cam_xclk
);

    reg [COUNTER_WIDTH-1:0] divider_count;

    initial begin
        if (XCLK_HZ <= 0 || SYS_CLK_HZ < (2 * XCLK_HZ) ||
            (SYS_CLK_HZ % (2 * XCLK_HZ)) != 0)
            $error("camera XCLK must be an exact integer divide of sys_clk");
    end

    always @(posedge sys_clk) begin
        if (!resetn || !enable) begin
            divider_count <= 0;
            cam_xclk <= 0;
        end else if (divider_count == HALF_PERIOD_CYCLES - 1) begin
            divider_count <= 0;
            cam_xclk <= ~cam_xclk;
        end else begin
            divider_count <= divider_count + 1'b1;
        end
    end

endmodule
