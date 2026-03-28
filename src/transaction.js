class Transaction {
    constructor(description, amount, date, uploadedBy, paymentMethod) {
        this.description = description;
        this.amount = amount;
        this.date = date;
        this.uploadedBy = uploadedBy;
        this.paymentMethod = paymentMethod;
        
    }   
}

module.exports = Transaction;