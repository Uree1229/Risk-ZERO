`timescale 1ns / 1ps

module tb_risk_zero_motion_axi_lite;
    reg clk = 0;
    reg resetn = 0;
    reg [5:0] awaddr = 0;
    reg awvalid = 0;
    wire awready;
    reg [31:0] wdata = 0;
    reg [3:0] wstrb = 0;
    reg wvalid = 0;
    wire wready;
    wire [1:0] bresp;
    wire bvalid;
    reg bready = 1;
    reg [5:0] araddr = 0;
    reg arvalid = 0;
    wire arready;
    wire [31:0] rdata;
    wire [1:0] rresp;
    wire rvalid;
    reg rready = 1;
    reg [31:0] read_value;

    always #5 clk = ~clk;

    risk_zero_motion_axi_lite #(
        .FRAME_WIDTH(8),
        .FRAME_HEIGHT(6)
    ) dut (
        .s_axi_aclk(clk),
        .s_axi_aresetn(resetn),
        .s_axi_awaddr(awaddr),
        .s_axi_awvalid(awvalid),
        .s_axi_awready(awready),
        .s_axi_wdata(wdata),
        .s_axi_wstrb(wstrb),
        .s_axi_wvalid(wvalid),
        .s_axi_wready(wready),
        .s_axi_bresp(bresp),
        .s_axi_bvalid(bvalid),
        .s_axi_bready(bready),
        .s_axi_araddr(araddr),
        .s_axi_arvalid(arvalid),
        .s_axi_arready(arready),
        .s_axi_rdata(rdata),
        .s_axi_rresp(rresp),
        .s_axi_rvalid(rvalid),
        .s_axi_rready(rready)
    );

    task write_address_first(input [5:0] address, input [31:0] value);
        begin
            @(posedge clk);
            awaddr <= address;
            awvalid <= 1;
            while (!awready) @(posedge clk);
            @(posedge clk);
            awvalid <= 0;
            repeat (2) @(posedge clk);
            wdata <= value;
            wstrb <= 4'hf;
            wvalid <= 1;
            while (!wready) @(posedge clk);
            @(posedge clk);
            wvalid <= 0;
            wait (bvalid);
            if (bresp != 2'b00) $fatal(1, "AXI write response error");
            @(posedge clk);
        end
    endtask

    task write_data_first(input [5:0] address, input [31:0] value);
        begin
            @(posedge clk);
            wdata <= value;
            wstrb <= 4'hf;
            wvalid <= 1;
            while (!wready) @(posedge clk);
            @(posedge clk);
            wvalid <= 0;
            repeat (2) @(posedge clk);
            awaddr <= address;
            awvalid <= 1;
            while (!awready) @(posedge clk);
            @(posedge clk);
            awvalid <= 0;
            wait (bvalid);
            if (bresp != 2'b00) $fatal(1, "AXI write response error");
            @(posedge clk);
        end
    endtask

    task read_register(input [5:0] address, output [31:0] value);
        begin
            @(posedge clk);
            araddr <= address;
            arvalid <= 1;
            while (!arready) @(posedge clk);
            @(posedge clk);
            arvalid <= 0;
            wait (rvalid);
            if (rresp != 2'b00) $fatal(1, "AXI read response error");
            value = rdata;
            @(posedge clk);
        end
    endtask

    initial begin
        repeat (4) @(posedge clk);
        resetn <= 1;
        read_register(6'h20, read_value);
        if (read_value != 32'h0001_0001) $fatal(1, "version register mismatch");

        write_address_first(6'h08, 32'd19);
        read_register(6'h08, read_value);
        if (read_value != 32'd19) $fatal(1, "address-first write failed");

        write_data_first(6'h08, 32'd27);
        read_register(6'h08, read_value);
        if (read_value != 32'd27) $fatal(1, "data-first write failed");

        $display("PASS: risk_zero_motion_axi_lite independent channels");
        $finish;
    end
endmodule
