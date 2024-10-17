//routes/companyRoutes.js
const express = require('express');const router = express.Router();const companyController = require('../controllers/companyController');
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT             });
router.post('/', (req, res, next) => {
    console.log('Received request body:', req.body);
    companyController.createCompany(req, res).catch(next);});
// Add new login route
router.post('/login', (req, res, next) => {
    companyController.loginCompany(req, res).catch(next);});
router.post('/events', (req, res, next) => {
    companyController.createEvent(req, res).catch(next);});
router.get('/events', (req, res, next) => {
    companyController.getUserEvents(req, res).catch(next);});
router.get('/banquet-details', (req, res, next) => {
    companyController.getBanquetDetails(req, res).catch(next);});
  router.get('/customers', (req, res, next) => {
    companyController.getCustomerMaster(req, res).catch(next);});
  router.post('/customers', (req, res, next) => {
    companyController.addCustomer(req, res).catch(next);});
// Add routes for updating and deleting
router.put('/customers', (req, res, next) => {
    companyController.updateCustomer(req, res).catch(next);});
router.delete('/customers', (req, res, next) => {
    companyController.deleteCustomer(req, res).catch(next);});
router.post('/validate-event', (req, res, next) => {
    companyController.validateEventDetails(req, res).catch(next);});
  console.log('Available controller methods:', Object.keys(companyController));
router.get('/banquet-halls', (req, res) => {
  console.log('Banquet halls route hit');
  companyController.getBanquetHalls(req, res);});
router.get('/events/:eventId', (req, res, next) => {
    console.log('Route hit: GET /events/:eventId');
    console.log('EventId param:', req.params.eventId);
    console.log('Query params:', req.query);
    companyController.getEventDetails(req, res).catch(next);});
  router.put('/events/:eventId', (req, res, next) => {
    companyController.updateEvent(req, res).catch(next);});
  router.get('/customer-search', (req, res, next) => {
    companyController.searchCustomers(req, res).catch(next);});
  router.get('/time-slots', (req, res, next) => {
    companyController.getTimeSlots(req, res).catch(next);});
  router.post('/time-slots', (req, res, next) => {
    companyController.updateBanquetTimeSlots(req, res).catch(next); });
  router.get('/event-count', (req, res, next) => {
    companyController.getEventCount(req, res).catch(next);});
    router.post('/banquet-bookings', (req, res, next) => {
      companyController.createBanquetBooking(req, res).catch(next);
    });
module.exports = router;