`timescale 1ns / 1ps

module tb_risk_zero_camera_xclk;
    reg sys_clk = 0;
    reg resetn = 0;
    reg enable = 0;
    wire cam_xclk;

    integer rising_edges = 0;
    time previous_rising_edge = 0;

    always #5 sys_clk = ~sys_clk;

    risk_zero_camera_xclk #(
        .SYS_CLK_HZ(100_000_000),
        .XCLK_HZ(25_000_000)
    ) dut (
        .sys_clk(sys_clk),
        .resetn(resetn),
        .enable(enable),
        .cam_xclk(cam_xclk)
    );

    always @(posedge cam_xclk) begin
        if (enable) begin
            if (rising_edges > 0 && ($time - previous_rising_edge) != 40)
                $fatal(1, "camera XCLK period is not 40 ns");
            previous_rising_edge = $time;
            rising_edges = rising_edges + 1;
        end
    end

    initial begin
        repeat (3) @(posedge sys_clk);
        resetn = 1;
        enable = 1;

        wait (rising_edges == 5);
        enable = 0;
        @(posedge sys_clk);
        #1;
        if (cam_xclk !== 1'b0)
            $fatal(1, "disabled camera XCLK was not held low");

        resetn = 0;
        #1;
        if (cam_xclk !== 1'b0)
            $fatal(1, "reset camera XCLK was not held low");

        $display("PASS: risk_zero_camera_xclk");
        $finish;
    end
endmodule
