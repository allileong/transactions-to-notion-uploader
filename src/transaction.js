class Transaction {
    constructor(description, amount, date, paymentMethod) {
        this.description = description;
        this.amount = amount;
        this.date = date;
        this.paymentMethod = paymentMethod;
        
    }   
}

module.exports = Transaction;