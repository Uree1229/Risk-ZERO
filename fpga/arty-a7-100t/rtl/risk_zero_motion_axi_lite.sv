`timescale 1ns / 1ps

module risk_zero_motion_axi_lite #(
    parameter integer FRAME_WIDTH = 160,
    parameter integer FRAME_HEIGHT = 120,
    parameter integer C_S_AXI_DATA_WIDTH = 32,
    parameter integer C_S_AXI_ADDR_WIDTH = 6
) (
    (* X_INTERFACE_INFO = "xilinx.com:signal:clock:1.0 s_axi_aclk CLK" *)
    (* X_INTERFACE_PARAMETER = "XIL_INTERFACENAME s_axi_aclk, ASSOCIATED_BUSIF s_axi, ASSOCIATED_RESET s_axi_aresetn" *)
    input  wire                              s_axi_aclk,
    (* X_INTERFACE_INFO = "xilinx.com:signal:reset:1.0 s_axi_aresetn RST" *)
    (* X_INTERFACE_PARAMETER = "XIL_INTERFACENAME s_axi_aresetn, POLARITY ACTIVE_LOW" *)
    input  wire                              s_axi_aresetn,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi AWADDR" *)
    (* X_INTERFACE_PARAMETER = "XIL_INTERFACENAME s_axi, PROTOCOL AXI4LITE, DATA_WIDTH 32, ADDR_WIDTH 6" *)
    input  wire [C_S_AXI_ADDR_WIDTH-1:0]     s_axi_awaddr,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi AWVALID" *)
    input  wire                              s_axi_awvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi AWREADY" *)
    output wire                              s_axi_awready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi WDATA" *)
    input  wire [C_S_AXI_DATA_WIDTH-1:0]     s_axi_wdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi WSTRB" *)
    input  wire [(C_S_AXI_DATA_WIDTH/8)-1:0] s_axi_wstrb,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi WVALID" *)
    input  wire                              s_axi_wvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi WREADY" *)
    output wire                              s_axi_wready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi BRESP" *)
    output reg  [1:0]                        s_axi_bresp,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi BVALID" *)
    output reg                               s_axi_bvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi BREADY" *)
    input  wire                              s_axi_bready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi ARADDR" *)
    input  wire [C_S_AXI_ADDR_WIDTH-1:0]     s_axi_araddr,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi ARVALID" *)
    input  wire                              s_axi_arvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi ARREADY" *)
    output wire                              s_axi_arready,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi RDATA" *)
    output reg  [C_S_AXI_DATA_WIDTH-1:0]     s_axi_rdata,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi RRESP" *)
    output reg  [1:0]                        s_axi_rresp,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi RVALID" *)
    output reg                               s_axi_rvalid,
    (* X_INTERFACE_INFO = "xilinx.com:interface:aximm:1.0 s_axi RREADY" *)
    input  wire                              s_axi_rready
);

    localparam [5:0] ADDR_CONTROL = 6'h00;
    localparam [5:0] ADDR_PIXEL   = 6'h04;
    localparam [5:0] ADDR_CONFIG  = 6'h08;
    localparam [5:0] ADDR_STATUS  = 6'h0c;
    localparam [5:0] ADDR_COUNT   = 6'h10;
    localparam [5:0] ADDR_SUM_X   = 6'h14;
    localparam [5:0] ADDR_SUM_Y   = 6'h18;
    localparam [5:0] ADDR_BBOX    = 6'h1c;
    localparam [5:0] ADDR_VERSION = 6'h20;

    reg write_address_stored;
    reg write_data_stored;
    reg [C_S_AXI_ADDR_WIDTH-1:0] write_address;
    reg [C_S_AXI_DATA_WIDTH-1:0] write_data;
    reg [(C_S_AXI_DATA_WIDTH/8)-1:0] write_strobes;

    wire address_accept = s_axi_awvalid && s_axi_awready;
    wire data_accept = s_axi_wvalid && s_axi_wready;
    wire write_accept = !s_axi_bvalid &&
        (write_address_stored || address_accept) &&
        (write_data_stored || data_accept);
    wire [C_S_AXI_ADDR_WIDTH-1:0] accepted_address =
        write_address_stored ? write_address : s_axi_awaddr;
    wire [C_S_AXI_DATA_WIDTH-1:0] accepted_data =
        write_data_stored ? write_data : s_axi_wdata;
    wire [(C_S_AXI_DATA_WIDTH/8)-1:0] accepted_strobes =
        write_data_stored ? write_strobes : s_axi_wstrb;
    wire read_accept = s_axi_arvalid && !s_axi_rvalid;
    assign s_axi_awready = !write_address_stored && !s_axi_bvalid;
    assign s_axi_wready = !write_data_stored && !s_axi_bvalid;
    assign s_axi_arready = read_accept;

    reg [7:0] threshold;
    reg frame_start;
    reg background_reset;
    reg pixel_valid;
    reg [7:0] pixel_data;
    reg result_pending;

    wire core_result_valid;
    wire background_ready;
    wire [31:0] motion_count;
    wire [31:0] sum_x;
    wire [31:0] sum_y;
    wire [7:0] min_x;
    wire [7:0] max_x;
    wire [7:0] min_y;
    wire [7:0] max_y;

    risk_zero_motion_core #(
        .FRAME_WIDTH(FRAME_WIDTH),
        .FRAME_HEIGHT(FRAME_HEIGHT)
    ) core (
        .clk(s_axi_aclk),
        .resetn(s_axi_aresetn),
        .frame_start(frame_start),
        .background_reset(background_reset),
        .pixel_valid(pixel_valid),
        .pixel_data(pixel_data),
        .threshold(threshold),
        .result_valid(core_result_valid),
        .background_ready(background_ready),
        .motion_count(motion_count),
        .sum_x(sum_x),
        .sum_y(sum_y),
        .min_x(min_x),
        .max_x(max_x),
        .min_y(min_y),
        .max_y(max_y)
    );

    always @(posedge s_axi_aclk) begin
        if (!s_axi_aresetn) begin
            threshold <= 24;
            frame_start <= 0;
            background_reset <= 0;
            pixel_valid <= 0;
            pixel_data <= 0;
            result_pending <= 0;
            write_address_stored <= 0;
            write_data_stored <= 0;
            write_address <= 0;
            write_data <= 0;
            write_strobes <= 0;
            s_axi_bvalid <= 0;
            s_axi_bresp <= 2'b00;
        end else begin
            frame_start <= 0;
            background_reset <= 0;
            pixel_valid <= 0;

            if (s_axi_bvalid && s_axi_bready) begin
                s_axi_bvalid <= 0;
            end
            if (address_accept) begin
                write_address <= s_axi_awaddr;
                write_address_stored <= 1;
            end
            if (data_accept) begin
                write_data <= s_axi_wdata;
                write_strobes <= s_axi_wstrb;
                write_data_stored <= 1;
            end
            if (write_accept) begin
                s_axi_bvalid <= 1;
                s_axi_bresp <= 2'b00;
                write_address_stored <= 0;
                write_data_stored <= 0;
                case (accepted_address[5:0])
                    ADDR_CONTROL: if (accepted_strobes[0]) begin
                        frame_start <= accepted_data[0];
                        background_reset <= accepted_data[1];
                        if (accepted_data[2]) result_pending <= 0;
                    end
                    ADDR_PIXEL: if (accepted_strobes[0]) begin
                        pixel_data <= accepted_data[7:0];
                        pixel_valid <= 1;
                    end
                    ADDR_CONFIG: if (accepted_strobes[0]) begin
                        threshold <= accepted_data[7:0];
                    end
                    default: begin end
                endcase
            end
            if (core_result_valid) begin
                result_pending <= 1;
            end
        end
    end

    always @(posedge s_axi_aclk) begin
        if (!s_axi_aresetn) begin
            s_axi_rvalid <= 0;
            s_axi_rresp <= 2'b00;
            s_axi_rdata <= 0;
        end else begin
            if (s_axi_rvalid && s_axi_rready) begin
                s_axi_rvalid <= 0;
            end
            if (read_accept) begin
                s_axi_rvalid <= 1;
                s_axi_rresp <= 2'b00;
                case (s_axi_araddr[5:0])
                    ADDR_CONFIG:  s_axi_rdata <= {24'b0, threshold};
                    ADDR_STATUS:  s_axi_rdata <= {30'b0, background_ready, result_pending};
                    ADDR_COUNT:   s_axi_rdata <= motion_count;
                    ADDR_SUM_X:   s_axi_rdata <= sum_x;
                    ADDR_SUM_Y:   s_axi_rdata <= sum_y;
                    ADDR_BBOX:    s_axi_rdata <= {max_y, min_y, max_x, min_x};
                    ADDR_VERSION: s_axi_rdata <= 32'h0001_0001;
                    default:      s_axi_rdata <= 0;
                endcase
            end
        end
    end
endmodule
