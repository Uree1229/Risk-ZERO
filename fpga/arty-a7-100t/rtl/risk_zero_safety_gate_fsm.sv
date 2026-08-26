`timescale 1ns / 1ps

// Default-deny actuator gate. This block does not authenticate the ESP32;
// it rejects incomplete, stale, replayed, risky, or faulted requests and
// limits the actuator pulse width in hardware.
module risk_zero_safety_gate_fsm #(
    parameter integer GRANT_CYCLES = 100_000_000,
    parameter integer HEARTBEAT_TIMEOUT_CYCLES = 300_000_000,
    parameter integer SEQUENCE_WIDTH = 16,
    parameter integer GRANT_COUNTER_WIDTH =
        GRANT_CYCLES <= 1 ? 1 : $clog2(GRANT_CYCLES),
    parameter integer HEARTBEAT_COUNTER_WIDTH =
        HEARTBEAT_TIMEOUT_CYCLES <= 1 ? 1 : $clog2(HEARTBEAT_TIMEOUT_CYCLES + 1)
) (
    input  wire                      clk,
    input  wire                      resetn,

    input  wire                      request,
    input  wire                      approve,
    input  wire                      request_fresh,
    input  wire [SEQUENCE_WIDTH-1:0] request_sequence,
    input  wire [1:0]                risk_level,
    input  wire [1:0]                door_state,
    input  wire                      sensor_fault,
    input  wire                      heartbeat_toggle,
    input  wire                      clear_fault,

    output reg                       unlock_enable,
    output reg                       grant_pulse,
    output reg                       deny_pulse,
    output reg                       fault_latched,
    output wire [2:0]                state_debug,
    output reg  [3:0]                reason_code
);

    localparam [1:0] RISK_LOW = 2'b00;
    localparam [1:0] DOOR_CLOSED = 2'b00;
    localparam [1:0] DOOR_FORCED = 2'b10;
    localparam [1:0] DOOR_UNKNOWN = 2'b11;

    localparam [2:0] ST_BOOT         = 3'd0;
    localparam [2:0] ST_LOCKED       = 3'd1;
    localparam [2:0] ST_GRANT        = 3'd2;
    localparam [2:0] ST_WAIT_RELEASE = 3'd3;
    localparam [2:0] ST_FAULT        = 3'd4;

    localparam [3:0] REASON_NONE              = 4'd0;
    localparam [3:0] REASON_NOT_APPROVED      = 4'd1;
    localparam [3:0] REASON_RISK              = 4'd2;
    localparam [3:0] REASON_DOOR_NOT_CLOSED   = 4'd3;
    localparam [3:0] REASON_SENSOR_FAULT      = 4'd4;
    localparam [3:0] REASON_HEARTBEAT_TIMEOUT = 4'd5;
    localparam [3:0] REASON_STALE_REQUEST     = 4'd6;
    localparam [3:0] REASON_REPLAY            = 4'd7;
    localparam [3:0] REASON_FORCED_DOOR       = 4'd8;

    reg [2:0] state;
    reg [GRANT_COUNTER_WIDTH-1:0] grant_counter;
    reg [HEARTBEAT_COUNTER_WIDTH-1:0] heartbeat_counter;
    reg last_heartbeat_toggle;
    reg heartbeat_seen;
    reg [SEQUENCE_WIDTH-1:0] last_sequence;
    reg last_sequence_valid;

    wire heartbeat_changed = heartbeat_toggle != last_heartbeat_toggle;
    wire heartbeat_ok = heartbeat_seen &&
        heartbeat_counter < HEARTBEAT_TIMEOUT_CYCLES;
    wire door_is_forced = door_state == DOOR_FORCED || door_state == DOOR_UNKNOWN;
    wire [SEQUENCE_WIDTH-1:0] sequence_delta = request_sequence - last_sequence;
    // Strictly newer modulo sequence numbers have a non-zero delta whose MSB
    // is clear. This also permits the natural all-ones-to-zero wraparound.
    wire sequence_replayed = last_sequence_valid &&
        ((sequence_delta == 0) || sequence_delta[SEQUENCE_WIDTH-1]);
    assign state_debug = state;

    always @(posedge clk) begin
        if (!resetn) begin
            state <= ST_BOOT;
            grant_counter <= 0;
            heartbeat_counter <= 0;
            last_heartbeat_toggle <= heartbeat_toggle;
            heartbeat_seen <= 0;
            last_sequence <= 0;
            last_sequence_valid <= 0;
            unlock_enable <= 0;
            grant_pulse <= 0;
            deny_pulse <= 0;
            fault_latched <= 0;
            reason_code <= REASON_NONE;
        end else begin
            grant_pulse <= 0;
            deny_pulse <= 0;

            if (heartbeat_changed) begin
                last_heartbeat_toggle <= heartbeat_toggle;
                heartbeat_seen <= 1;
                heartbeat_counter <= 0;
            end else if (heartbeat_seen &&
                         heartbeat_counter < HEARTBEAT_TIMEOUT_CYCLES) begin
                heartbeat_counter <= heartbeat_counter + 1'b1;
            end

            case (state)
                ST_BOOT: begin
                    unlock_enable <= 0;
                    if (sensor_fault) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        reason_code <= REASON_SENSOR_FAULT;
                    end else if (door_is_forced) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        reason_code <= REASON_FORCED_DOOR;
                    end else if (heartbeat_ok && door_state == DOOR_CLOSED) begin
                        state <= ST_LOCKED;
                        reason_code <= REASON_NONE;
                    end
                end

                ST_LOCKED: begin
                    unlock_enable <= 0;
                    if (sensor_fault) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        reason_code <= REASON_SENSOR_FAULT;
                    end else if (!heartbeat_ok) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        reason_code <= REASON_HEARTBEAT_TIMEOUT;
                    end else if (door_is_forced) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        reason_code <= REASON_FORCED_DOOR;
                    end else if (request) begin
                        last_sequence <= request_sequence;
                        last_sequence_valid <= 1;
                        if (!approve) begin
                            deny_pulse <= 1;
                            reason_code <= REASON_NOT_APPROVED;
                            state <= ST_WAIT_RELEASE;
                        end else if (!request_fresh) begin
                            deny_pulse <= 1;
                            reason_code <= REASON_STALE_REQUEST;
                            state <= ST_WAIT_RELEASE;
                        end else if (sequence_replayed) begin
                            deny_pulse <= 1;
                            reason_code <= REASON_REPLAY;
                            state <= ST_WAIT_RELEASE;
                        end else if (risk_level != RISK_LOW) begin
                            deny_pulse <= 1;
                            reason_code <= REASON_RISK;
                            state <= ST_WAIT_RELEASE;
                        end else if (door_state != DOOR_CLOSED) begin
                            deny_pulse <= 1;
                            reason_code <= REASON_DOOR_NOT_CLOSED;
                            state <= ST_WAIT_RELEASE;
                        end else begin
                            unlock_enable <= 1;
                            grant_counter <= 0;
                            grant_pulse <= 1;
                            reason_code <= REASON_NONE;
                            state <= ST_GRANT;
                        end
                    end
                end

                ST_GRANT: begin
                    if (sensor_fault || !heartbeat_ok || door_is_forced) begin
                        unlock_enable <= 0;
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        if (sensor_fault)
                            reason_code <= REASON_SENSOR_FAULT;
                        else if (!heartbeat_ok)
                            reason_code <= REASON_HEARTBEAT_TIMEOUT;
                        else
                            reason_code <= REASON_FORCED_DOOR;
                    end else if (grant_counter == GRANT_CYCLES - 1) begin
                        unlock_enable <= 0;
                        state <= ST_WAIT_RELEASE;
                    end else begin
                        grant_counter <= grant_counter + 1'b1;
                    end
                end

                ST_WAIT_RELEASE: begin
                    unlock_enable <= 0;
                    if (sensor_fault || !heartbeat_ok || door_is_forced) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        if (sensor_fault)
                            reason_code <= REASON_SENSOR_FAULT;
                        else if (!heartbeat_ok)
                            reason_code <= REASON_HEARTBEAT_TIMEOUT;
                        else
                            reason_code <= REASON_FORCED_DOOR;
                    end else if (!request) begin
                        state <= ST_LOCKED;
                    end
                end

                default: begin  // ST_FAULT and illegal state encodings
                    unlock_enable <= 0;
                    fault_latched <= 1;
                    if (clear_fault && !request && !sensor_fault && heartbeat_ok &&
                        door_state == DOOR_CLOSED) begin
                        state <= ST_LOCKED;
                        fault_latched <= 0;
                        reason_code <= REASON_NONE;
                    end
                end
            endcase
        end
    end
endmodule
