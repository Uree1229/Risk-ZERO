`timescale 1ns / 1ps

module tb_risk_zero_safety_gate_fsm;
    localparam integer UNLOCK_PULSE_CYCLES = 8;
    localparam integer AUTH_TIMEOUT_CYCLES = 8;
    localparam integer HEARTBEAT_TIMEOUT_CYCLES = 80;

    reg clk = 0;
    reg resetn = 0;
    reg auth_toggle = 0;
    reg req_toggle = 0;
    reg heartbeat_toggle = 0;
    reg door_closed_direct = 1;
    reg tamper_detected = 0;
    reg estop_n = 1;
    reg clear_fault = 0;

    wire ack_toggle;
    wire [1:0] decision_code;
    wire [3:0] block_reason;
    wire auth_armed;
    wire fault_latched;
    wire unlock_allow_pulse;
    wire [2:0] state_debug;

    integer unlock_cycles;

    always #5 clk = ~clk;

    risk_zero_safety_gate_fsm #(
        .UNLOCK_PULSE_CYCLES(UNLOCK_PULSE_CYCLES),
        .AUTH_TIMEOUT_CYCLES(AUTH_TIMEOUT_CYCLES),
        .HEARTBEAT_TIMEOUT_CYCLES(HEARTBEAT_TIMEOUT_CYCLES)
    ) dut (
        .clk(clk),
        .resetn(resetn),
        .auth_toggle(auth_toggle),
        .req_toggle(req_toggle),
        .heartbeat_toggle(heartbeat_toggle),
        .door_closed_direct(door_closed_direct),
        .tamper_detected(tamper_detected),
        .estop_n(estop_n),
        .clear_fault(clear_fault),
        .ack_toggle(ack_toggle),
        .decision_code(decision_code),
        .block_reason(block_reason),
        .auth_armed(auth_armed),
        .fault_latched(fault_latched),
        .unlock_allow_pulse(unlock_allow_pulse),
        .state_debug(state_debug)
    );

    task wait_for_sync;
        begin
            repeat (3) @(posedge clk);
            #1;
        end
    endtask

    task heartbeat;
        begin
            heartbeat_toggle = ~heartbeat_toggle;
            wait_for_sync();
            // heartbeat_seen is registered on the synchronized edge; BOOT
            // observes heartbeat_ok on the following safety clock.
            @(posedge clk);
            #1;
        end
    endtask

    task authorize;
        begin
            auth_toggle = ~auth_toggle;
            wait_for_sync();
        end
    endtask

    task request_unlock;
        begin
            req_toggle = ~req_toggle;
            wait_for_sync();
        end
    endtask

    task clear_latched_fault;
        begin
            heartbeat();
            clear_fault = 1;
            wait_for_sync();
            clear_fault = 0;
            wait_for_sync();
        end
    endtask

    initial begin
        repeat (3) @(posedge clk);
        resetn = 1;
        repeat (5) @(posedge clk);
        #1;
        if (unlock_allow_pulse || state_debug != 0)
            $fatal(1, "reset must default deny in BOOT");

        heartbeat();
        if (state_debug != 1 || fault_latched)
            $fatal(1, "healthy heartbeat must enter LOCKED");

        authorize();
        if (!auth_armed)
            $fatal(1, "authorization toggle did not arm token");
        request_unlock();
        if (decision_code != 1 || !unlock_allow_pulse || auth_armed)
            $fatal(1, "valid auth/request did not produce ALLOW pulse");

        unlock_cycles = 1;
        while (unlock_allow_pulse) begin
            @(posedge clk);
            #1;
            if (unlock_allow_pulse)
                unlock_cycles = unlock_cycles + 1;
        end
        if (unlock_cycles != UNLOCK_PULSE_CYCLES)
            $fatal(1, "unlock pulse width expected %0d, got %0d",
                   UNLOCK_PULSE_CYCLES, unlock_cycles);

        heartbeat();
        request_unlock();
        if (decision_code != 2 || block_reason != 1 || unlock_allow_pulse)
            $fatal(1, "request without authorization was not blocked");

        heartbeat();
        authorize();
        repeat (AUTH_TIMEOUT_CYCLES + 1) @(posedge clk);
        #1;
        if (auth_armed)
            $fatal(1, "authorization did not expire");
        request_unlock();
        if (decision_code != 2 || block_reason != 2)
            $fatal(1, "expired authorization reason was not reported");

        heartbeat();
        door_closed_direct = 0;
        wait_for_sync();
        authorize();
        request_unlock();
        if (decision_code != 2 || block_reason != 3 || unlock_allow_pulse)
            $fatal(1, "open direct reed input did not block");
        door_closed_direct = 1;
        wait_for_sync();

        heartbeat();
        tamper_detected = 1;
        wait_for_sync();
        if (!fault_latched || block_reason != 4 || unlock_allow_pulse)
            $fatal(1, "tamper did not latch fail-closed fault");
        clear_fault = 1;
        wait_for_sync();
        if (!fault_latched)
            $fatal(1, "fault cleared while tamper remained active");
        clear_fault = 0;
        tamper_detected = 0;
        wait_for_sync();
        clear_latched_fault();
        if (fault_latched || state_debug != 1)
            $fatal(1, "safe explicit clear did not recover LOCKED");

        heartbeat();
        authorize();
        request_unlock();
        if (!unlock_allow_pulse)
            $fatal(1, "abort test did not enter unlock pulse");
        estop_n = 0;
        wait_for_sync();
        if (unlock_allow_pulse || !fault_latched ||
            decision_code != 3 || block_reason != 5)
            $fatal(1, "E-stop did not immediately abort synchronized pulse");
        estop_n = 1;
        wait_for_sync();
        clear_latched_fault();

        repeat (HEARTBEAT_TIMEOUT_CYCLES + 2) @(posedge clk);
        #1;
        if (!fault_latched || block_reason != 6 || unlock_allow_pulse)
            $fatal(1, "heartbeat timeout did not fail closed");

        $display("PASS: risk_zero_safety_gate_fsm");
        $finish;
    end
endmodule
