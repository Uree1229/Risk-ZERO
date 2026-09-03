`timescale 1ns / 1ps

// Reads the OV7670 PID/VER registers before any format-specific register table
// is applied. This block deliberately does not contain camera initialization
// values; those remain gated on the physical module and DVP measurements.
module risk_zero_ov7670_id_probe #(
    parameter integer STARTUP_CYCLES = 1_000_000,
    parameter integer RESPONSE_TIMEOUT_CYCLES = 2_000_000,
    parameter [7:0] EXPECTED_PID = 8'h76,
    parameter [7:0] EXPECTED_VER = 8'h73
) (
    input  wire       clk,
    input  wire       resetn,
    input  wire       start,
    input  wire       clear_fault,

    output reg        command_valid,
    input  wire       command_ready,
    output reg        command_read,
    output reg  [7:0] register_address,
    output reg  [7:0] write_data,
    input  wire [7:0] read_data,
    input  wire       command_done,

    output reg        probe_busy,
    output reg        probe_done,
    output reg        camera_ready,
    output wire       camera_fault,
    output reg        id_fault,
    output reg        sccb_timeout_fault,
    output reg  [7:0] camera_pid,
    output reg  [7:0] camera_version
);

    localparam [2:0] ST_IDLE     = 3'd0;
    localparam [2:0] ST_STARTUP  = 3'd1;
    localparam [2:0] ST_PID_REQ  = 3'd2;
    localparam [2:0] ST_PID_WAIT = 3'd3;
    localparam [2:0] ST_VER_REQ  = 3'd4;
    localparam [2:0] ST_VER_WAIT = 3'd5;
    localparam [2:0] ST_READY    = 3'd6;
    localparam [2:0] ST_FAULT    = 3'd7;

    reg [2:0] state;
    reg [31:0] counter;

    assign camera_fault = id_fault | sccb_timeout_fault;

    initial begin
        if (STARTUP_CYCLES < 1 || RESPONSE_TIMEOUT_CYCLES < 1)
            $error("OV7670 probe cycle counts must be positive");
    end

    always @(posedge clk) begin
        if (!resetn) begin
            state <= ST_IDLE;
            counter <= 0;
            command_valid <= 0;
            command_read <= 1;
            register_address <= 0;
            write_data <= 0;
            probe_busy <= 0;
            probe_done <= 0;
            camera_ready <= 0;
            id_fault <= 0;
            sccb_timeout_fault <= 0;
            camera_pid <= 0;
            camera_version <= 0;
        end else begin
            command_valid <= 0;
            probe_done <= 0;

            if (clear_fault) begin
                state <= ST_IDLE;
                counter <= 0;
                probe_busy <= 0;
                camera_ready <= 0;
                id_fault <= 0;
                sccb_timeout_fault <= 0;
                camera_pid <= 0;
                camera_version <= 0;
            end else begin
                case (state)
                    ST_IDLE: begin
                        if (start) begin
                            counter <= 0;
                            probe_busy <= 1;
                            camera_ready <= 0;
                            id_fault <= 0;
                            sccb_timeout_fault <= 0;
                            camera_pid <= 0;
                            camera_version <= 0;
                            state <= ST_STARTUP;
                        end
                    end

                    ST_STARTUP: begin
                        if (counter == STARTUP_CYCLES - 1) begin
                            counter <= 0;
                            state <= ST_PID_REQ;
                        end else begin
                            counter <= counter + 1'b1;
                        end
                    end

                    ST_PID_REQ: begin
                        if (command_ready) begin
                            command_valid <= 1;
                            command_read <= 1;
                            register_address <= 8'h0A;
                            write_data <= 0;
                            counter <= 0;
                            state <= ST_PID_WAIT;
                        end
                    end

                    ST_PID_WAIT: begin
                        if (command_done) begin
                            camera_pid <= read_data;
                            counter <= 0;
                            if (read_data == EXPECTED_PID)
                                state <= ST_VER_REQ;
                            else begin
                                id_fault <= 1;
                                probe_busy <= 0;
                                probe_done <= 1;
                                state <= ST_FAULT;
                            end
                        end else if (counter == RESPONSE_TIMEOUT_CYCLES - 1) begin
                            sccb_timeout_fault <= 1;
                            probe_busy <= 0;
                            probe_done <= 1;
                            state <= ST_FAULT;
                        end else begin
                            counter <= counter + 1'b1;
                        end
                    end

                    ST_VER_REQ: begin
                        if (command_ready) begin
                            command_valid <= 1;
                            command_read <= 1;
                            register_address <= 8'h0B;
                            write_data <= 0;
                            counter <= 0;
                            state <= ST_VER_WAIT;
                        end
                    end

                    ST_VER_WAIT: begin
                        if (command_done) begin
                            camera_version <= read_data;
                            counter <= 0;
                            probe_busy <= 0;
                            probe_done <= 1;
                            if (read_data == EXPECTED_VER) begin
                                camera_ready <= 1;
                                state <= ST_READY;
                            end else begin
                                id_fault <= 1;
                                state <= ST_FAULT;
                            end
                        end else if (counter == RESPONSE_TIMEOUT_CYCLES - 1) begin
                            sccb_timeout_fault <= 1;
                            probe_busy <= 0;
                            probe_done <= 1;
                            state <= ST_FAULT;
                        end else begin
                            counter <= counter + 1'b1;
                        end
                    end

                    ST_READY: begin
                        if (start) begin
                            counter <= 0;
                            probe_busy <= 1;
                            camera_ready <= 0;
                            camera_pid <= 0;
                            camera_version <= 0;
                            state <= ST_STARTUP;
                        end
                    end

                    ST_FAULT: begin
                        probe_busy <= 0;
                        camera_ready <= 0;
                    end

                    default: state <= ST_FAULT;
                endcase
            end
        end
    end

endmodule
