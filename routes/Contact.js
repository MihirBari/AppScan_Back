const express = require("express");
const {   showContact,
    showOneContact,
    showOneCustomer,
    addContact,
    editContact,
    city,
    designation,
    customerentity,
    name,
    addCustomer,
  editCustomer,
  showCustomer,
    deleteContact,
    deleteCustomer,
    showCustomerOpportunity,
    showSummaryContact,Contactcustomerentity,
    summaryContactCustomerentity,
    showSummaryOpportunity} = require("../controller/Contact");
const { authenticateToken } = require("../utils/authenticateToken");
const router = express.Router();


router.get("/showContact/:id" ,authenticateToken, showContact);
router.get("/showCustomer" ,authenticateToken, showCustomer);
router.get("/showOneContact/:id",authenticateToken, showOneContact);
router.get("/showOneCustomer/:id",authenticateToken, showOneCustomer);
router.post("/addContact",authenticateToken, addContact);
router.post("/addCustomer",authenticateToken, addCustomer);
router.put("/editContact/:id",authenticateToken, editContact);
router.put("/editCustomer/:id",authenticateToken, editCustomer);
router.delete("/deleteContact",authenticateToken, deleteContact);
router.delete("/deleteCustomer",authenticateToken, deleteCustomer);
router.get("/city",authenticateToken, city);
router.get("/designation",authenticateToken, designation);
router.get("/customerentity",authenticateToken, customerentity);
router.get("/name",authenticateToken, name);
router.post("/showCustomerOpportunity",authenticateToken, showCustomerOpportunity);
router.post("/showSummaryOpportunity",authenticateToken, showSummaryOpportunity);
router.get("/showSummaryContact/:id",authenticateToken, showSummaryContact);
router.get("/Contactcustomerentity/:id",authenticateToken, Contactcustomerentity);
router.get("/summaryContactCustomerentity/:id",authenticateToken, summaryContactCustomerentity);


module.exports = router;