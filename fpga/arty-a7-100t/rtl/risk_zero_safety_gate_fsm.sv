`timescale 1ns / 1ps

// Always-on, default-deny actuator gate.
//
// The Door Hub presents edge-coded authorization, request and heartbeat
// signals. Direct door, tamper and emergency-stop inputs are synchronized
// independently and take priority over the Door Hub. The Vision Domain is not
// connected to this module and therefore cannot open the actuator directly.
module risk_zero_safety_gate_fsm #(
    parameter integer UNLOCK_PULSE_CYCLES = 100_000_000,
    parameter integer AUTH_TIMEOUT_CYCLES = 1_500_000_000,
    parameter integer HEARTBEAT_TIMEOUT_CYCLES = 300_000_000,
    parameter integer UNLOCK_COUNTER_WIDTH =
        UNLOCK_PULSE_CYCLES <= 1 ? 1 : $clog2(UNLOCK_PULSE_CYCLES),
    parameter integer AUTH_COUNTER_WIDTH =
        AUTH_TIMEOUT_CYCLES <= 1 ? 1 : $clog2(AUTH_TIMEOUT_CYCLES + 1),
    parameter integer HEARTBEAT_COUNTER_WIDTH =
        HEARTBEAT_TIMEOUT_CYCLES <= 1 ? 1 : $clog2(HEARTBEAT_TIMEOUT_CYCLES + 1)
) (
    input  wire       clk,
    input  wire       resetn,

    // Asynchronous Door Hub control plane. Each new event toggles the signal.
    input  wire       auth_toggle,
    input  wire       req_toggle,
    input  wire       heartbeat_toggle,

    // Asynchronous direct hardware inputs.
    input  wire       door_closed_direct,
    input  wire       tamper_detected,
    input  wire       estop_n,
    input  wire       clear_fault,

    output reg        ack_toggle,
    output reg  [1:0] decision_code,
    output reg  [3:0] block_reason,
    output reg        auth_armed,
    output reg        fault_latched,
    output reg        unlock_allow_pulse,
    output wire [2:0] state_debug
);

    localparam [1:0] DECISION_NONE  = 2'd0;
    localparam [1:0] DECISION_ALLOW = 2'd1;
    localparam [1:0] DECISION_BLOCK = 2'd2;
    localparam [1:0] DECISION_ABORT = 2'd3;

    localparam [3:0] REASON_NONE              = 4'd0;
    localparam [3:0] REASON_NO_AUTH           = 4'd1;
    localparam [3:0] REASON_AUTH_EXPIRED      = 4'd2;
    localparam [3:0] REASON_DOOR_OPEN         = 4'd3;
    localparam [3:0] REASON_TAMPER             = 4'd4;
    localparam [3:0] REASON_ESTOP              = 4'd5;
    localparam [3:0] REASON_HEARTBEAT_TIMEOUT = 4'd6;

    localparam [2:0] ST_BOOT   = 3'd0;
    localparam [2:0] ST_LOCKED = 3'd1;
    localparam [2:0] ST_UNLOCK = 3'd2;
    localparam [2:0] ST_FAULT  = 3'd3;

    reg [2:0] state;
    assign state_debug = state;

    reg auth_meta;
    reg auth_sync;
    reg req_meta;
    reg req_sync;
    reg heartbeat_meta;
    reg heartbeat_sync;
    reg door_closed_meta;
    reg door_closed_sync;
    reg tamper_meta;
    reg tamper_sync;
    reg estop_n_meta;
    reg estop_n_sync;
    reg clear_fault_meta;
    reg clear_fault_sync;

    reg [1:0] synchronizer_warmup;
    reg last_auth_toggle;
    reg last_req_toggle;
    reg last_heartbeat_toggle;

    wire synchronizers_ready = &synchronizer_warmup;
    wire auth_event = synchronizers_ready && auth_sync != last_auth_toggle;
    wire req_event = synchronizers_ready && req_sync != last_req_toggle;
    wire heartbeat_event =
        synchronizers_ready && heartbeat_sync != last_heartbeat_toggle;

    reg heartbeat_seen;
    reg [HEARTBEAT_COUNTER_WIDTH-1:0] heartbeat_counter;
    wire heartbeat_ok = heartbeat_seen &&
        heartbeat_counter < HEARTBEAT_TIMEOUT_CYCLES;

    reg [AUTH_COUNTER_WIDTH-1:0] auth_counter;
    reg auth_expired;
    reg [UNLOCK_COUNTER_WIDTH-1:0] unlock_counter;

    wire estop_active = !estop_n_sync;
    wire direct_fatal = tamper_sync || estop_active;

    always @(posedge clk) begin
        if (!resetn) begin
            auth_meta <= 0;
            auth_sync <= 0;
            req_meta <= 0;
            req_sync <= 0;
            heartbeat_meta <= 0;
            heartbeat_sync <= 0;
            door_closed_meta <= 0;
            door_closed_sync <= 0;
            tamper_meta <= 0;
            tamper_sync <= 0;
            estop_n_meta <= 0;
            estop_n_sync <= 0;
            clear_fault_meta <= 0;
            clear_fault_sync <= 0;
            synchronizer_warmup <= 0;
            last_auth_toggle <= 0;
            last_req_toggle <= 0;
            last_heartbeat_toggle <= 0;
            heartbeat_seen <= 0;
            heartbeat_counter <= 0;
            auth_counter <= 0;
            auth_expired <= 0;
            unlock_counter <= 0;
            state <= ST_BOOT;
            ack_toggle <= 0;
            decision_code <= DECISION_NONE;
            block_reason <= REASON_NONE;
            auth_armed <= 0;
            fault_latched <= 0;
            unlock_allow_pulse <= 0;
        end else begin
            auth_meta <= auth_toggle;
            auth_sync <= auth_meta;
            req_meta <= req_toggle;
            req_sync <= req_meta;
            heartbeat_meta <= heartbeat_toggle;
            heartbeat_sync <= heartbeat_meta;
            door_closed_meta <= door_closed_direct;
            door_closed_sync <= door_closed_meta;
            tamper_meta <= tamper_detected;
            tamper_sync <= tamper_meta;
            estop_n_meta <= estop_n;
            estop_n_sync <= estop_n_meta;
            clear_fault_meta <= clear_fault;
            clear_fault_sync <= clear_fault_meta;

            if (!synchronizers_ready) begin
                synchronizer_warmup <= synchronizer_warmup + 1'b1;
                last_auth_toggle <= auth_sync;
                last_req_toggle <= req_sync;
                last_heartbeat_toggle <= heartbeat_sync;
            end else begin
                if (auth_event)
                    last_auth_toggle <= auth_sync;
                if (req_event)
                    last_req_toggle <= req_sync;
                if (heartbeat_event)
                    last_heartbeat_toggle <= heartbeat_sync;
            end

            if (heartbeat_event) begin
                heartbeat_seen <= 1;
                heartbeat_counter <= 0;
            end else if (heartbeat_seen &&
                         heartbeat_counter < HEARTBEAT_TIMEOUT_CYCLES) begin
                heartbeat_counter <= heartbeat_counter + 1'b1;
            end

            if (auth_event) begin
                auth_counter <= 0;
                auth_expired <= 0;
                auth_armed <= heartbeat_ok && !fault_latched &&
                    !direct_fatal;
            end else if (auth_armed) begin
                if (auth_counter >= AUTH_TIMEOUT_CYCLES - 1) begin
                    auth_armed <= 0;
                    auth_expired <= 1;
                end else begin
                    auth_counter <= auth_counter + 1'b1;
                end
            end

            case (state)
                ST_BOOT: begin
                    unlock_allow_pulse <= 0;
                    if (!synchronizers_ready) begin
                        state <= ST_BOOT;
                    end else if (direct_fatal) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        decision_code <= DECISION_BLOCK;
                        block_reason <= estop_active ? REASON_ESTOP : REASON_TAMPER;
                        auth_armed <= 0;
                    end else if (heartbeat_ok) begin
                        state <= ST_LOCKED;
                        decision_code <= DECISION_NONE;
                        block_reason <= REASON_NONE;
                    end

                    if (req_event) begin
                        ack_toggle <= ~ack_toggle;
                        decision_code <= DECISION_BLOCK;
                        block_reason <= REASON_HEARTBEAT_TIMEOUT;
                        auth_armed <= 0;
                    end
                end

                ST_LOCKED: begin
                    unlock_allow_pulse <= 0;

                    if (direct_fatal || !heartbeat_ok) begin
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        decision_code <= DECISION_BLOCK;
                        if (estop_active)
                            block_reason <= REASON_ESTOP;
                        else if (tamper_sync)
                            block_reason <= REASON_TAMPER;
                        else
                            block_reason <= REASON_HEARTBEAT_TIMEOUT;
                        auth_armed <= 0;
                    end else if (req_event) begin
                        ack_toggle <= ~ack_toggle;
                        auth_armed <= 0;
                        if (!door_closed_sync) begin
                            decision_code <= DECISION_BLOCK;
                            block_reason <= REASON_DOOR_OPEN;
                        end else if (!auth_armed) begin
                            decision_code <= DECISION_BLOCK;
                            block_reason <= auth_expired
                                ? REASON_AUTH_EXPIRED
                                : REASON_NO_AUTH;
                        end else begin
                            state <= ST_UNLOCK;
                            unlock_counter <= 0;
                            unlock_allow_pulse <= 1;
                            decision_code <= DECISION_ALLOW;
                            block_reason <= REASON_NONE;
                        end
                    end
                end

                ST_UNLOCK: begin
                    if (req_event)
                        ack_toggle <= ~ack_toggle;

                    if (direct_fatal || !heartbeat_ok || !door_closed_sync) begin
                        unlock_allow_pulse <= 0;
                        state <= ST_FAULT;
                        fault_latched <= 1;
                        decision_code <= DECISION_ABORT;
                        if (estop_active)
                            block_reason <= REASON_ESTOP;
                        else if (tamper_sync)
                            block_reason <= REASON_TAMPER;
                        else if (!door_closed_sync)
                            block_reason <= REASON_DOOR_OPEN;
                        else
                            block_reason <= REASON_HEARTBEAT_TIMEOUT;
                        auth_armed <= 0;
                    end else if (unlock_counter >= UNLOCK_PULSE_CYCLES - 1) begin
                        unlock_allow_pulse <= 0;
                        state <= ST_LOCKED;
                    end else begin
                        unlock_counter <= unlock_counter + 1'b1;
                    end
                end

                default: begin  // ST_FAULT and illegal encodings
                    unlock_allow_pulse <= 0;
                    fault_latched <= 1;
                    auth_armed <= 0;

                    if (req_event) begin
                        ack_toggle <= ~ack_toggle;
                        decision_code <= DECISION_BLOCK;
                    end

                    if (clear_fault_sync && !direct_fatal &&
                        door_closed_sync && heartbeat_ok) begin
                        state <= ST_LOCKED;
                        fault_latched <= 0;
                        decision_code <= DECISION_NONE;
                        block_reason <= REASON_NONE;
                    end
                end
            endcase
        end
    end
endmodule
