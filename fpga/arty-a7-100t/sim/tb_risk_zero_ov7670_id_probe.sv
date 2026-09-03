`timescale 1ns / 1ps

module tb_risk_zero_ov7670_id_probe;
    reg clk = 0;
    reg resetn = 0;
    reg start = 0;
    reg clear_fault = 0;
    wire command_valid;
    reg command_ready = 1;
    wire command_read;
    wire [7:0] register_address;
    wire [7:0] write_data;
    reg [7:0] read_data = 0;
    reg command_done = 0;
    wire probe_busy;
    wire probe_done;
    wire camera_ready;
    wire camera_fault;
    wire id_fault;
    wire sccb_timeout_fault;
    wire [7:0] camera_pid;
    wire [7:0] camera_version;

    reg response_enabled = 1;
    reg [7:0] response_pid = 8'h76;
    reg [7:0] response_ver = 8'h73;
    reg pending = 0;
    reg [7:0] pending_address = 0;
    integer command_count = 0;

    always #5 clk = ~clk;

    risk_zero_ov7670_id_probe #(
        .STARTUP_CYCLES(3),
        .RESPONSE_TIMEOUT_CYCLES(12)
    ) dut (
        .clk(clk),
        .resetn(resetn),
        .start(start),
        .clear_fault(clear_fault),
        .command_valid(command_valid),
        .command_ready(command_ready),
        .command_read(command_read),
        .register_address(register_address),
        .write_data(write_data),
        .read_data(read_data),
        .command_done(command_done),
        .probe_busy(probe_busy),
        .probe_done(probe_done),
        .camera_ready(camera_ready),
        .camera_fault(camera_fault),
        .id_fault(id_fault),
        .sccb_timeout_fault(sccb_timeout_fault),
        .camera_pid(camera_pid),
        .camera_version(camera_version)
    );

    always @(posedge clk) begin
        command_done <= 0;
        if (pending && response_enabled) begin
            pending <= 0;
            read_data <= (pending_address == 8'h0A) ? response_pid : response_ver;
            command_done <= 1;
        end
        if (command_valid) begin
            if (!command_read)
                $fatal(1, "ID probe attempted a register write");
            if (register_address != 8'h0A && register_address != 8'h0B)
                $fatal(1, "ID probe requested unexpected register %02x", register_address);
            pending <= 1;
            pending_address <= register_address;
            command_count <= command_count + 1;
        end
    end

    task pulse_start;
        begin
            @(negedge clk);
            start = 1;
            @(negedge clk);
            start = 0;
        end
    endtask

    task pulse_clear;
        begin
            @(negedge clk);
            clear_fault = 1;
            @(negedge clk);
            clear_fault = 0;
        end
    endtask

    initial begin
        repeat (3) @(posedge clk);
        resetn = 1;

        pulse_start();
        wait(probe_done);
        #1;
        if (!camera_ready || camera_fault || probe_busy)
            $fatal(1, "matching OV7670 ID did not reach ready");
        if (camera_pid != 8'h76 || camera_version != 8'h73 || command_count != 2)
            $fatal(1, "ID result mismatch pid=%02x ver=%02x commands=%0d",
                   camera_pid, camera_version, command_count);

        pulse_clear();
        response_pid = 8'h75;
        pulse_start();
        wait(probe_done);
        #1;
        if (camera_ready || !camera_fault || !id_fault || sccb_timeout_fault)
            $fatal(1, "wrong PID was not classified as ID fault");
        if (camera_pid != 8'h75 || command_count != 3)
            $fatal(1, "wrong PID should stop before VER read");

        pulse_clear();
        response_pid = 8'h76;
        response_enabled = 0;
        pending = 0;
        pulse_start();
        wait(probe_done);
        #1;
        if (camera_ready || !camera_fault || id_fault || !sccb_timeout_fault)
            $fatal(1, "missing SCCB completion was not classified as timeout");

        $display("PASS: risk_zero_ov7670_id_probe ready_id_fault_timeout");
        $finish;
    end
endmodule
