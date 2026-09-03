`timescale 1ns / 1ps

module tb_risk_zero_async_fifo;
    reg write_clk = 0;
    reg read_clk = 0;
    reg write_resetn = 0;
    reg read_resetn = 0;
    reg write_enable = 0;
    reg [7:0] write_data = 0;
    reg read_enable = 0;
    wire full;
    wire overflow;
    wire [7:0] read_data;
    wire read_valid;
    wire empty;
    wire underflow;

    integer expected_value = 0;
    integer received_count = 0;
    integer value;

    always #5 write_clk = ~write_clk;
    always #7 read_clk = ~read_clk;

    risk_zero_async_fifo #(.DATA_WIDTH(8), .DEPTH(8)) dut (
        .write_clk(write_clk), .write_resetn(write_resetn),
        .write_enable(write_enable), .write_data(write_data),
        .full(full), .overflow(overflow),
        .read_clk(read_clk), .read_resetn(read_resetn),
        .read_enable(read_enable), .read_data(read_data),
        .read_valid(read_valid), .empty(empty), .underflow(underflow)
    );

    always @(posedge read_clk) begin
        #1;
        if (read_valid) begin
            if (read_data != expected_value[7:0])
                $fatal(1, "FIFO order mismatch expected=%0d actual=%0d",
                       expected_value, read_data);
            expected_value = expected_value + 1;
            received_count = received_count + 1;
        end
    end

    task reset_fifo;
        begin
            write_resetn = 0;
            read_resetn = 0;
            write_enable = 0;
            read_enable = 0;
            repeat (3) @(posedge write_clk);
            repeat (3) @(posedge read_clk);
            @(negedge write_clk);
            write_resetn = 1;
            @(negedge read_clk);
            read_resetn = 1;
        end
    endtask

    task write_one;
        input [7:0] data;
        begin
            @(negedge write_clk);
            write_data = data;
            write_enable = 1;
            @(negedge write_clk);
            write_enable = 0;
        end
    endtask

    task read_one;
        begin
            @(negedge read_clk);
            read_enable = 1;
            @(negedge read_clk);
            read_enable = 0;
        end
    endtask

    initial begin
        reset_fifo();
        expected_value = 0;
        received_count = 0;

        for (value = 0; value < 6; value = value + 1)
            write_one(value[7:0]);
        repeat (4) @(posedge read_clk);
        for (value = 0; value < 6; value = value + 1)
            read_one();
        repeat (3) @(posedge read_clk);
        if (received_count != 6 || !empty)
            $fatal(1, "FIFO drain mismatch received=%0d empty=%0d",
                   received_count, empty);

        @(negedge read_clk);
        read_enable = 1;
        @(posedge read_clk);
        #1;
        if (!underflow)
            $fatal(1, "empty FIFO did not report underflow");
        @(negedge read_clk);
        read_enable = 0;

        reset_fifo();
        for (value = 0; value < 8; value = value + 1)
            write_one(value[7:0]);
        @(posedge write_clk);
        #1;
        if (!full)
            $fatal(1, "filled FIFO did not assert full");

        @(negedge write_clk);
        write_enable = 1;
        write_data = 8'hFF;
        @(posedge write_clk);
        #1;
        if (!overflow)
            $fatal(1, "full FIFO did not report overflow");
        @(negedge write_clk);
        write_enable = 0;

        $display("PASS: risk_zero_async_fifo order_underflow_overflow");
        $finish;
    end
endmodule
