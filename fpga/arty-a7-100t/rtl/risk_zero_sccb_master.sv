`timescale 1ns / 1ps

// Minimal two-wire SCCB controller for OV-series camera register access.
//
// SIO_D is exposed as an open-drain intent rather than an inout port. The top
// level must drive the physical pin LOW when siod_drive_low is asserted and
// otherwise release it. An external pull-up at the camera I/O voltage is
// required. SIO_C is unidirectional for the OV7670 and is driven push-pull.
//
// OV7670 random register reads are two separate transmissions:
//   START, 0x42, register, STOP, START, 0x43, data, STOP
// The STOP between the address and data transmissions is intentional. A
// repeated START alone is not used here.
module risk_zero_sccb_master #(
    parameter integer SYS_CLK_HZ = 100_000_000,
    parameter integer SCCB_HZ = 100_000,
    parameter [6:0] DEVICE_ADDRESS = 7'h21
) (
    input  wire       clk,
    input  wire       resetn,

    input  wire       command_valid,
    output wire       command_ready,
    input  wire       command_read,
    input  wire [7:0] register_address,
    input  wire [7:0] write_data,

    output reg  [7:0] read_data,
    output reg        busy,
    output reg        done,
    output reg        ninth_bit_sample,

    output reg        sioc,
    output reg        siod_drive_low,
    input  wire       siod_in
);

    localparam integer SCCB_DENOMINATOR = (SCCB_HZ > 0) ? (2 * SCCB_HZ) : 1;
    localparam integer STEP_DIV =
        (SYS_CLK_HZ + SCCB_DENOMINATOR - 1) / SCCB_DENOMINATOR;
    localparam integer DIV_WIDTH = (STEP_DIV <= 1) ? 1 : $clog2(STEP_DIV);

    localparam [4:0] ST_IDLE               = 5'd0;
    localparam [4:0] ST_START_ASSERT       = 5'd1;
    localparam [4:0] ST_BIT_LOW            = 5'd2;
    localparam [4:0] ST_BIT_HIGH           = 5'd3;
    localparam [4:0] ST_NINTH_LOW          = 5'd4;
    localparam [4:0] ST_NINTH_HIGH         = 5'd5;
    localparam [4:0] ST_ADDRESS_STOP_LOW   = 5'd6;
    localparam [4:0] ST_ADDRESS_STOP_HIGH  = 5'd7;
    localparam [4:0] ST_ADDRESS_STOP_FREE  = 5'd8;
    localparam [4:0] ST_READ_START_GAP     = 5'd9;
    localparam [4:0] ST_READ_START_ASSERT  = 5'd10;
    localparam [4:0] ST_READ_LOW           = 5'd11;
    localparam [4:0] ST_READ_HIGH          = 5'd12;
    localparam [4:0] ST_READ_NINTH_LOW     = 5'd13;
    localparam [4:0] ST_READ_NINTH_HIGH    = 5'd14;
    localparam [4:0] ST_FINAL_STOP_LOW     = 5'd15;
    localparam [4:0] ST_FINAL_STOP_HIGH    = 5'd16;
    localparam [4:0] ST_FINAL_STOP_RELEASE = 5'd17;

    localparam [1:0] TX_DEVICE_WRITE = 2'd0;
    localparam [1:0] TX_REGISTER     = 2'd1;
    localparam [1:0] TX_WRITE_DATA   = 2'd2;
    localparam [1:0] TX_DEVICE_READ  = 2'd3;

    reg [4:0] state;
    reg [1:0] tx_stage;
    reg [DIV_WIDTH-1:0] divider;
    reg [7:0] tx_shift;
    reg [2:0] bit_index;
    reg latched_read;
    reg [7:0] latched_register;
    reg [7:0] latched_write_data;

    wire step_tick = (divider == STEP_DIV - 1);

    assign command_ready = (state == ST_IDLE);

    initial begin
        if (SYS_CLK_HZ <= 0 || SCCB_HZ <= 0 || SYS_CLK_HZ < 2 * SCCB_HZ)
            $error("invalid SCCB clock parameters");
    end

    always @(posedge clk) begin
        if (!resetn || state == ST_IDLE) begin
            divider <= 0;
        end else if (step_tick) begin
            divider <= 0;
        end else begin
            divider <= divider + 1'b1;
        end
    end

    always @(posedge clk) begin
        if (!resetn) begin
            state <= ST_IDLE;
            tx_stage <= TX_DEVICE_WRITE;
            tx_shift <= 0;
            bit_index <= 3'd7;
            latched_read <= 0;
            latched_register <= 0;
            latched_write_data <= 0;
            read_data <= 0;
            busy <= 0;
            done <= 0;
            ninth_bit_sample <= 1;
            sioc <= 1;
            siod_drive_low <= 0;
        end else begin
            done <= 0;

            if (state == ST_IDLE && command_valid) begin
                latched_read <= command_read;
                latched_register <= register_address;
                latched_write_data <= write_data;
                read_data <= 0;
                busy <= 1;
                tx_stage <= TX_DEVICE_WRITE;
                tx_shift <= {DEVICE_ADDRESS, 1'b0};
                bit_index <= 3'd7;
                sioc <= 1;
                siod_drive_low <= 0;
                state <= ST_START_ASSERT;
            end else if (step_tick) begin
                case (state)
                    ST_START_ASSERT: begin
                        sioc <= 1;
                        siod_drive_low <= 1;
                        state <= ST_BIT_LOW;
                    end

                    ST_BIT_LOW: begin
                        sioc <= 0;
                        siod_drive_low <= ~tx_shift[bit_index];
                        state <= ST_BIT_HIGH;
                    end

                    ST_BIT_HIGH: begin
                        sioc <= 1;
                        if (bit_index == 0)
                            state <= ST_NINTH_LOW;
                        else begin
                            bit_index <= bit_index - 1'b1;
                            state <= ST_BIT_LOW;
                        end
                    end

                    ST_NINTH_LOW: begin
                        sioc <= 0;
                        siod_drive_low <= 0;
                        state <= ST_NINTH_HIGH;
                    end

                    ST_NINTH_HIGH: begin
                        sioc <= 1;
                        ninth_bit_sample <= siod_in;
                        bit_index <= 3'd7;
                        case (tx_stage)
                            TX_DEVICE_WRITE: begin
                                tx_stage <= TX_REGISTER;
                                tx_shift <= latched_register;
                                state <= ST_BIT_LOW;
                            end
                            TX_REGISTER: begin
                                if (latched_read)
                                    state <= ST_ADDRESS_STOP_LOW;
                                else begin
                                    tx_stage <= TX_WRITE_DATA;
                                    tx_shift <= latched_write_data;
                                    state <= ST_BIT_LOW;
                                end
                            end
                            TX_WRITE_DATA:
                                state <= ST_FINAL_STOP_LOW;
                            TX_DEVICE_READ:
                                state <= ST_READ_LOW;
                            default:
                                state <= ST_FINAL_STOP_LOW;
                        endcase
                    end

                    ST_ADDRESS_STOP_LOW: begin
                        sioc <= 0;
                        siod_drive_low <= 1;
                        state <= ST_ADDRESS_STOP_HIGH;
                    end

                    ST_ADDRESS_STOP_HIGH: begin
                        sioc <= 1;
                        siod_drive_low <= 1;
                        state <= ST_ADDRESS_STOP_FREE;
                    end

                    ST_ADDRESS_STOP_FREE: begin
                        sioc <= 1;
                        siod_drive_low <= 0;
                        state <= ST_READ_START_GAP;
                    end

                    ST_READ_START_GAP: begin
                        sioc <= 1;
                        siod_drive_low <= 0;
                        state <= ST_READ_START_ASSERT;
                    end

                    ST_READ_START_ASSERT: begin
                        sioc <= 1;
                        siod_drive_low <= 1;
                        tx_stage <= TX_DEVICE_READ;
                        tx_shift <= {DEVICE_ADDRESS, 1'b1};
                        bit_index <= 3'd7;
                        state <= ST_BIT_LOW;
                    end

                    ST_READ_LOW: begin
                        sioc <= 0;
                        siod_drive_low <= 0;
                        state <= ST_READ_HIGH;
                    end

                    ST_READ_HIGH: begin
                        sioc <= 1;
                        read_data[bit_index] <= siod_in;
                        if (bit_index == 0)
                            state <= ST_READ_NINTH_LOW;
                        else begin
                            bit_index <= bit_index - 1'b1;
                            state <= ST_READ_LOW;
                        end
                    end

                    ST_READ_NINTH_LOW: begin
                        sioc <= 0;
                        siod_drive_low <= 0;
                        state <= ST_READ_NINTH_HIGH;
                    end

                    ST_READ_NINTH_HIGH: begin
                        sioc <= 1;
                        siod_drive_low <= 0;
                        ninth_bit_sample <= siod_in;
                        state <= ST_FINAL_STOP_LOW;
                    end

                    ST_FINAL_STOP_LOW: begin
                        sioc <= 0;
                        siod_drive_low <= 1;
                        state <= ST_FINAL_STOP_HIGH;
                    end

                    ST_FINAL_STOP_HIGH: begin
                        sioc <= 1;
                        siod_drive_low <= 1;
                        state <= ST_FINAL_STOP_RELEASE;
                    end

                    ST_FINAL_STOP_RELEASE: begin
                        sioc <= 1;
                        siod_drive_low <= 0;
                        busy <= 0;
                        done <= 1;
                        state <= ST_IDLE;
                    end

                    default: begin
                        sioc <= 1;
                        siod_drive_low <= 0;
                        busy <= 0;
                        state <= ST_IDLE;
                    end
                endcase
            end
        end
    end

endmodule
