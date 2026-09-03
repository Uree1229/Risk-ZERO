`timescale 1ns / 1ps

// Dual-clock Gray-pointer FIFO for moving camera data out of the PCLK domain.
// write_resetn and read_resetn must each be deasserted synchronously to their
// respective clock domains by the integrating top level.
module risk_zero_async_fifo #(
    parameter integer DATA_WIDTH = 32,
    parameter integer DEPTH = 16
) (
    input  wire                  write_clk,
    input  wire                  write_resetn,
    input  wire                  write_enable,
    input  wire [DATA_WIDTH-1:0] write_data,
    output reg                   full,
    output reg                   overflow,

    input  wire                  read_clk,
    input  wire                  read_resetn,
    input  wire                  read_enable,
    output reg  [DATA_WIDTH-1:0] read_data,
    output reg                   read_valid,
    output wire                  empty,
    output reg                   underflow
);

    localparam integer ADDRESS_WIDTH = $clog2(DEPTH);
    localparam integer POINTER_WIDTH = ADDRESS_WIDTH + 1;

    (* ram_style = "auto" *) reg [DATA_WIDTH-1:0] memory [0:DEPTH-1];
    reg [POINTER_WIDTH-1:0] write_binary;
    reg [POINTER_WIDTH-1:0] write_gray;
    reg [POINTER_WIDTH-1:0] read_binary;
    reg [POINTER_WIDTH-1:0] read_gray;

    (* ASYNC_REG = "TRUE" *) reg [POINTER_WIDTH-1:0] read_gray_sync1;
    (* ASYNC_REG = "TRUE" *) reg [POINTER_WIDTH-1:0] read_gray_sync2;
    (* ASYNC_REG = "TRUE" *) reg [POINTER_WIDTH-1:0] write_gray_sync1;
    (* ASYNC_REG = "TRUE" *) reg [POINTER_WIDTH-1:0] write_gray_sync2;

    wire write_accept = write_enable && !full;
    wire read_accept = read_enable && !empty;
    wire [POINTER_WIDTH-1:0] write_binary_next =
        write_binary + write_accept;
    wire [POINTER_WIDTH-1:0] write_gray_next =
        (write_binary_next >> 1) ^ write_binary_next;
    wire [POINTER_WIDTH-1:0] read_binary_next =
        read_binary + read_accept;
    wire [POINTER_WIDTH-1:0] read_gray_next =
        (read_binary_next >> 1) ^ read_binary_next;
    wire full_next = (write_gray_next == {
        ~read_gray_sync2[POINTER_WIDTH-1:POINTER_WIDTH-2],
        read_gray_sync2[POINTER_WIDTH-3:0]
    });

    assign empty = (read_gray == write_gray_sync2);

    initial begin
        if (DEPTH < 4 || (DEPTH & (DEPTH - 1)) != 0)
            $error("async FIFO depth must be a power of two and at least four");
    end

    // Keep the storage array out of the asynchronously reset control blocks.
    // Resetting the RAM port processes prevents Vivado from inferring FPGA RAM.
    always @(posedge write_clk) begin
        if (write_accept)
            memory[write_binary[ADDRESS_WIDTH-1:0]] <= write_data;
    end

    always @(posedge read_clk) begin
        if (read_accept)
            read_data <= memory[read_binary[ADDRESS_WIDTH-1:0]];
    end

    always @(posedge write_clk or negedge write_resetn) begin
        if (!write_resetn) begin
            write_binary <= 0;
            write_gray <= 0;
            full <= 0;
            overflow <= 0;
        end else begin
            overflow <= write_enable && full;
            write_binary <= write_binary_next;
            write_gray <= write_gray_next;
            full <= full_next;
        end
    end

    always @(posedge read_clk or negedge read_resetn) begin
        if (!read_resetn) begin
            read_binary <= 0;
            read_gray <= 0;
            read_valid <= 0;
            underflow <= 0;
        end else begin
            read_valid <= read_accept;
            underflow <= read_enable && empty;
            read_binary <= read_binary_next;
            read_gray <= read_gray_next;
        end
    end

    always @(posedge write_clk or negedge write_resetn) begin
        if (!write_resetn) begin
            read_gray_sync1 <= 0;
            read_gray_sync2 <= 0;
        end else begin
            read_gray_sync1 <= read_gray;
            read_gray_sync2 <= read_gray_sync1;
        end
    end

    always @(posedge read_clk or negedge read_resetn) begin
        if (!read_resetn) begin
            write_gray_sync1 <= 0;
            write_gray_sync2 <= 0;
        end else begin
            write_gray_sync1 <= write_gray;
            write_gray_sync2 <= write_gray_sync1;
        end
    end

endmodule
