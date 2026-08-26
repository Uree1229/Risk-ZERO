`timescale 1ns / 1ps

module tb_risk_zero_safety_gate_fsm;
    localparam integer GRANT_CYCLES = 4;
    localparam integer HEARTBEAT_TIMEOUT_CYCLES = 12;

    reg clk = 0;
    reg resetn = 0;
    reg request = 0;
    reg approve = 0;
    reg request_fresh = 0;
    reg [15:0] request_sequence = 0;
    reg [1:0] risk_level = 0;
    reg [1:0] door_state = 0;
    reg sensor_fault = 0;
    reg heartbeat_toggle = 0;
    reg clear_fault = 0;
    wire unlock_enable;
    wire grant_pulse;
    wire deny_pulse;
    wire fault_latched;
    wire [2:0] state_debug;
    wire [3:0] reason_code;

    integer unlock_cycles;

    always #5 clk = ~clk;

    risk_zero_safety_gate_fsm #(
        .GRANT_CYCLES(GRANT_CYCLES),
        .HEARTBEAT_TIMEOUT_CYCLES(HEARTBEAT_TIMEOUT_CYCLES)
    ) dut (
        .clk(clk),
        .resetn(resetn),
        .request(request),
        .approve(approve),
        .request_fresh(request_fresh),
        .request_sequence(request_sequence),
        .risk_level(risk_level),
        .door_state(door_state),
        .sensor_fault(sensor_fault),
        .heartbeat_toggle(heartbeat_toggle),
        .clear_fault(clear_fault),
        .unlock_enable(unlock_enable),
        .grant_pulse(grant_pulse),
        .deny_pulse(deny_pulse),
        .fault_latched(fault_latched),
        .state_debug(state_debug),
        .reason_code(reason_code)
    );

    task heartbeat;
        begin
            heartbeat_toggle <= ~heartbeat_toggle;
            @(posedge clk);
            @(posedge clk);
        end
    endtask

    task release_request;
        begin
            request <= 0;
            @(posedge clk);
            @(posedge clk);
        end
    endtask

    task submit_request;
        input [15:0] sequence;
        input accepted;
        input fresh;
        input [1:0] risk;
        begin
            request_sequence <= sequence;
            approve <= accepted;
            request_fresh <= fresh;
            risk_level <= risk;
            request <= 1;
            @(posedge clk);
            #1;
        end
    endtask

    initial begin
        repeat (3) @(posedge clk);
        resetn <= 1;
        @(posedge clk);
        #1;
        if (unlock_enable || state_debug != 0)
            $fatal(1, "reset must default deny in BOOT");

        heartbeat();
        @(posedge clk);
        #1;
        if (state_debug != 1 || unlock_enable)
            $fatal(1, "healthy heartbeat must enter LOCKED");

        submit_request(16'h0010, 1, 1, 2'b00);
        if (!grant_pulse || !unlock_enable)
            $fatal(1, "valid request was not granted");
        unlock_cycles = 0;
        while (unlock_enable) begin
            unlock_cycles = unlock_cycles + 1;
            @(posedge clk);
            #1;
        end
        if (unlock_cycles != GRANT_CYCLES)
            $fatal(1, "grant width expected %0d, got %0d", GRANT_CYCLES, unlock_cycles);
        repeat (2) @(posedge clk);
        if (unlock_enable || grant_pulse)
            $fatal(1, "held request retriggered unlock");
        release_request();

        heartbeat();
        submit_request(16'h0011, 0, 1, 2'b00);
        if (!deny_pulse || reason_code != 1 || unlock_enable)
            $fatal(1, "unapproved request was not denied");
        release_request();

        heartbeat();
        submit_request(16'h0012, 1, 0, 2'b00);
        if (!deny_pulse || reason_code != 6)
            $fatal(1, "stale request was not denied");
        release_request();

        heartbeat();
        submit_request(16'h0013, 1, 1, 2'b10);
        if (!deny_pulse || reason_code != 2)
            $fatal(1, "high-risk request was not denied");
        release_request();
        risk_level <= 0;

        heartbeat();
        submit_request(16'h0010, 1, 1, 2'b00);
        if (!deny_pulse || reason_code != 7)
            $fatal(1, "replayed sequence was not denied");
        release_request();

        heartbeat();
        submit_request(16'h0020, 1, 1, 2'b00);
        if (!unlock_enable) $fatal(1, "fault-abort setup did not grant");
        sensor_fault <= 1;
        @(posedge clk);
        #1;
        if (unlock_enable || !fault_latched || reason_code != 4)
            $fatal(1, "sensor fault did not abort and latch");

        request <= 0;
        clear_fault <= 1;
        @(posedge clk);
        #1;
        if (!fault_latched) $fatal(1, "fault cleared while sensor remained faulty");
        sensor_fault <= 0;
        heartbeat_toggle <= ~heartbeat_toggle;
        @(posedge clk);
        @(posedge clk);
        #1;
        if (fault_latched || state_debug != 1)
            $fatal(1, "healthy explicit clear did not recover LOCKED");
        clear_fault <= 0;

        repeat (HEARTBEAT_TIMEOUT_CYCLES + 2) @(posedge clk);
        #1;
        if (!fault_latched || reason_code != 5 || unlock_enable)
            $fatal(1, "heartbeat timeout did not fail closed");

        $display("PASS: risk_zero_safety_gate_fsm");
        $finish;
    end
endmodule
