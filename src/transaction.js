class Transaction {
    constructor(description, amount, date, createdBy, paymentMethod) {
        this.description = description;
        this.amount = amount;
        this.date = date;
        this.createdBy = createdBy;
        this.paymentMethod = paymentMethod;
        
    }   
}

module.exports = Transaction;