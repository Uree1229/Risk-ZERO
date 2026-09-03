`timescale 1ns / 1ps

module tb_risk_zero_sccb_master;
    reg clk = 0;
    reg resetn = 0;
    reg command_valid = 0;
    reg command_read = 0;
    reg [7:0] register_address = 0;
    reg [7:0] write_data = 0;
    wire command_ready;
    wire [7:0] read_data;
    wire busy;
    wire done;
    wire ninth_bit_sample;
    wire sioc;
    wire siod_drive_low;

    tri siod_line;
    reg slave_drive_low = 0;
    reg [7:0] slave_read_value = 8'h76;

    integer start_count = 0;
    integer stop_count = 0;
    integer transaction_index = 0;
    integer phase_count = 0;
    integer observed_count = 0;
    reg transaction_active = 0;
    reg [7:0] sampled_shift = 0;
    reg [7:0] observed_bytes [0:7];

    always #5 clk = ~clk;

    pullup (siod_line);
    assign siod_line = siod_drive_low ? 1'b0 : 1'bz;
    assign siod_line = slave_drive_low ? 1'b0 : 1'bz;

    risk_zero_sccb_master #(
        .SYS_CLK_HZ(1_000_000),
        .SCCB_HZ(100_000)
    ) dut (
        .clk(clk),
        .resetn(resetn),
        .command_valid(command_valid),
        .command_ready(command_ready),
        .command_read(command_read),
        .register_address(register_address),
        .write_data(write_data),
        .read_data(read_data),
        .busy(busy),
        .done(done),
        .ninth_bit_sample(ninth_bit_sample),
        .sioc(sioc),
        .siod_drive_low(siod_drive_low),
        .siod_in(siod_line)
    );

    // Observe protocol boundaries only from the externally visible bus.
    always @(negedge siod_line) begin
        if (resetn && sioc && !transaction_active) begin
            transaction_active = 1;
            transaction_index = start_count;
            start_count = start_count + 1;
            phase_count = 0;
            sampled_shift = 0;
        end
    end

    always @(posedge siod_line) begin
        if (resetn && sioc && transaction_active) begin
            transaction_active = 0;
            stop_count = stop_count + 1;
            slave_drive_low = 0;
        end
    end

    // The camera drives only the data byte of the second read transmission.
    always @(negedge sioc) begin
        if (transaction_active && transaction_index == 1 &&
            phase_count >= 9 && phase_count <= 16)
            slave_drive_low = ~slave_read_value[16 - phase_count];
        else
            slave_drive_low = 0;
    end

    // Decode complete bus bytes. A stop sequence can begin a partial group,
    // but only complete groups are recorded.
    always @(posedge sioc) begin
        if (resetn && transaction_active) begin
            if ((phase_count % 9) < 8) begin
                sampled_shift = {sampled_shift[6:0], siod_line};
                if ((phase_count % 9) == 7) begin
                    observed_bytes[observed_count] = sampled_shift;
                    observed_count = observed_count + 1;
                end
            end
            phase_count = phase_count + 1;
        end
    end

    task clear_observation;
        integer index;
        begin
            start_count = 0;
            stop_count = 0;
            transaction_index = 0;
            phase_count = 0;
            observed_count = 0;
            transaction_active = 0;
            sampled_shift = 0;
            slave_drive_low = 0;
            for (index = 0; index < 8; index = index + 1)
                observed_bytes[index] = 0;
        end
    endtask

    task issue_command;
        input is_read;
        input [7:0] address;
        input [7:0] value;
        begin
            wait(command_ready);
            @(negedge clk);
            command_read = is_read;
            register_address = address;
            write_data = value;
            command_valid = 1;
            @(negedge clk);
            command_valid = 0;
            wait(done);
            #1;
            if (busy)
                $fatal(1, "SCCB busy remained asserted after done");
            @(negedge clk);
        end
    endtask

    initial begin
        repeat (3) @(posedge clk);
        resetn = 1;

        clear_observation();
        issue_command(0, 8'h12, 8'h80);
        if (start_count != 1 || stop_count != 1 || observed_count != 3)
            $fatal(1, "write framing mismatch starts=%0d stops=%0d bytes=%0d",
                   start_count, stop_count, observed_count);
        if (observed_bytes[0] != 8'h42 || observed_bytes[1] != 8'h12 ||
            observed_bytes[2] != 8'h80)
            $fatal(1, "write payload mismatch %02x %02x %02x",
                   observed_bytes[0], observed_bytes[1], observed_bytes[2]);

        clear_observation();
        slave_read_value = 8'h76;
        issue_command(1, 8'h0A, 8'h00);
        if (start_count != 2 || stop_count != 2 || observed_count != 4)
            $fatal(1, "read must contain STOP/START boundary: starts=%0d stops=%0d bytes=%0d",
                   start_count, stop_count, observed_count);
        if (observed_bytes[0] != 8'h42 || observed_bytes[1] != 8'h0A ||
            observed_bytes[2] != 8'h43 || observed_bytes[3] != 8'h76)
            $fatal(1, "read payload mismatch %02x %02x %02x %02x",
                   observed_bytes[0], observed_bytes[1],
                   observed_bytes[2], observed_bytes[3]);
        if (read_data != 8'h76)
            $fatal(1, "read data mismatch: %02x", read_data);
        if (!ninth_bit_sample)
            $fatal(1, "released SCCB ninth bit was not sampled high");

        $display("PASS: risk_zero_sccb_master write_and_two_transaction_read");
        $finish;
    end
endmodule
