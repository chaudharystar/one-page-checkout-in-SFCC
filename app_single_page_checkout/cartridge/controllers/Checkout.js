var server = require('server');
server.extend(module.superModule);

var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.append('Begin', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
    var ProductMgr = require('dw/catalog/ProductMgr');
    var currentBasket = BasketMgr.getCurrentBasket();
    var viewData = res.getViewData();
    if (viewData.currentStage == 'shipping') {
        viewData.currentStage = 'single_page';
    }
    res.setViewData(viewData);

    return next();
}
);

server.post(
    'SinglePageCheckout',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var URLUtils = require('dw/web/URLUtils');
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
        var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
        var PaymentManager = require('dw/order/PaymentMgr');
        var HookManager = require('dw/system/HookMgr');
        var currentBasket = BasketMgr.getCurrentBasket();
        var Resource = require('dw/web/Resource');
        var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');
        var StoreMgr = require('dw/catalog/StoreMgr');

        if (!currentBasket) {
            res.json({
                error: true,
                cartError: true,
                fieldErrors: [],
                serverErrors: [],
                redirectUrl: URLUtils.url('Cart-Show').toString()
            });
            return next();
        }

        var validatedProducts = validationHelpers.validateProducts(currentBasket);
        if (validatedProducts.error) {
            res.json({
                error: true,
                cartError: true,
                fieldErrors: [],
                serverErrors: [],
                redirectUrl: URLUtils.url('Cart-Show').toString()
            });
            return next();
        }

        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
        var shippingForm = server.forms.getForm('shipping');
        var paymentForm = server.forms.getForm('billing');
        var storeId = req.form.storeId;
        var store = StoreMgr.getStore(storeId);
        var shipment = currentBasket.defaultShipment;
        var formFieldErrors = [];
        var shippingFormErrors = {};
        var billingFormErrors = {};
        var shippingFormData = {};
        var billingFormData = {};

        if (!usingMultiShipping) {
            if (shipment.shippingMethod.custom.storePickupEnabled) {
                if (!req.form.storeId) {
                    res.setStatusCode(500);
                    res.json({
                        error: true,
                        errorMessage: Resource.msg('error.no.store.selected', 'storeLocator', null)
                    });
                }
                else {
                    shippingFormData.address = {
                        firstName: store.name,
                        lastName: '',
                        address1: store.address1,
                        address2: store.address2,
                        city: store.city,
                        stateCode: store.stateCode,
                        postalCode: store.postalCode,
                        countryCode: store.countryCode.value,
                        phone: store.phone
                    };
                }
            }
            else {
                // verify shipping form data
                shippingFormErrors = COHelpers.validateShippingForm(shippingForm.shippingAddress.addressFields);

                if (Object.keys(shippingFormErrors).length > 0) {
                    req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'invalid');
                    formFieldErrors.push(shippingFormErrors)
                } else {
                    req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'valid');

                    shippingFormData.address = {
                        firstName: shippingForm.shippingAddress.addressFields.firstName.value,
                        lastName: shippingForm.shippingAddress.addressFields.lastName.value,
                        address1: shippingForm.shippingAddress.addressFields.address1.value,
                        address2: shippingForm.shippingAddress.addressFields.address2.value,
                        city: shippingForm.shippingAddress.addressFields.city.value,
                        postalCode: shippingForm.shippingAddress.addressFields.postalCode.value,
                        countryCode: shippingForm.shippingAddress.addressFields.country.value,
                        phone: shippingForm.shippingAddress.addressFields.phone.value
                    };
                    if (Object.prototype.hasOwnProperty.call(shippingForm.shippingAddress.addressFields, 'states')) {
                        shippingFormData.address.stateCode = shippingForm.shippingAddress.addressFields.states.stateCode.value;
                    }
                }
            }

            shippingFormData.shippingMethod = shippingForm.shippingAddress.shippingMethodID.value ? shippingForm.shippingAddress.shippingMethodID.value.toString() : null;
            shippingFormData.isGift = shippingForm.shippingAddress.isGift.checked;
            shippingFormData.giftMessage = shippingFormData.isGift ? shippingForm.shippingAddress.giftMessage.value : null;
        

            billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);

            if (Object.keys(billingFormErrors).length) {
                formFieldErrors.push(billingFormErrors);
            } else {

                billingFormData.address = {
                    firstName: paymentForm.addressFields.firstName.value,
                    lastName: paymentForm.addressFields.lastName.value,
                    address1: paymentForm.addressFields.address1.value,
                    address2: paymentForm.addressFields.address2.value,
                    city: paymentForm.addressFields.city.value,
                    postalCode: paymentForm.addressFields.postalCode.value,
                    countryCode: paymentForm.addressFields.country.value
                };
                if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
                    billingFormData.address.stateCode = paymentForm.addressFields.states.stateCode.value;
                }
            }
        } else {

            // checking billing error for multishipping
            billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);
            if (Object.keys(billingFormErrors).length) {
                formFieldErrors.push(billingFormErrors);
            } else {
                billingFormData.address = {
                    firstName: paymentForm.addressFields.firstName.value,
                    lastName: paymentForm.addressFields.lastName.value,
                    address1: paymentForm.addressFields.address1.value,
                    address2: paymentForm.addressFields.address2.value,
                    city: paymentForm.addressFields.city.value,
                    postalCode: paymentForm.addressFields.postalCode.value,
                    countryCode: paymentForm.addressFields.country.value
                };
                if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
                    billingFormData.address.stateCode = paymentForm.addressFields.states.stateCode.value;
                }
            }
        }

        // contact form error is same for both single and multiship
        var contactInfoFormErrors = COHelpers.validateFields(paymentForm.contactInfoFields);
        if (Object.keys(contactInfoFormErrors).length) {
            formFieldErrors.push(contactInfoFormErrors);
        } else {
            // billingFormData.email = paymentForm.contactInfoFields.email.value
            billingFormData.phone = paymentForm.contactInfoFields.phone.htmlValue;
        }

        var paymentMethodIdValue = paymentForm.paymentMethod.value;
        if (!PaymentManager.getPaymentMethod(paymentMethodIdValue).paymentProcessor) {
            throw new Error(Resource.msg(
                'error.payment.processor.missing',
                'checkout',
                null
            ));
        }
        var paymentProcessor = PaymentManager.getPaymentMethod(paymentMethodIdValue).getPaymentProcessor();
        var paymentFormResult;

        if (HookManager.hasHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase())) {
            paymentFormResult = HookManager.callHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase(),
                'processForm',
                req,
                paymentForm,
                billingFormData
            );
        } else {
            paymentFormResult = HookManager.callHook('app.payment.form.processor.default_form_processor', 'processForm');
        }

        if (paymentFormResult.error && paymentFormResult.fieldErrors) {
            formFieldErrors.push(paymentFormResult.fieldErrors);
        }

        if (formFieldErrors.length || paymentFormResult.serverErrors) {
            res.json({
                form: paymentForm,
                fieldErrors: formFieldErrors,
                serverErrors: paymentFormResult.serverErrors ? paymentFormResult.serverErrors : [],
                error: true
            });
            return next();
        }

        if (!usingMultiShipping && !currentBasket.billingAddress) {
            if (req.currentCustomer.addressBook
                && req.currentCustomer.addressBook.preferredAddress) {
                // Copy over preferredAddress (use addressUUID for matching)
                COHelpers.copyBillingAddressToBasket(
                    req.currentCustomer.addressBook.preferredAddress, currentBasket);
            } else {
                // Copy over first shipping address (use shipmentUUID for matching)
                COHelpers.copyBillingAddressToBasket(
                    currentBasket.defaultShipment.shippingAddress, currentBasket);
            }
        }

        res.setViewData({
            shippingData: shippingFormData,
            billingData: paymentFormResult.viewData
        });


        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var AccountModel = require('*/cartridge/models/account');
            var OrderModel = require('*/cartridge/models/order');
            var BasketMgr = require('dw/order/BasketMgr');
            var HookMgr = require('dw/system/HookMgr');
            var PaymentMgr = require('dw/order/PaymentMgr');
            var PaymentInstrument = require('dw/order/PaymentInstrument');
            var Transaction = require('dw/system/Transaction');
            var URLUtils = require('dw/web/URLUtils');
            var Locale = require('dw/util/Locale');
            var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
            var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
            var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
            var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');

            var viewData = res.getViewData();
            var shippingData = viewData.shippingData
            var billingData = viewData.billingData
            if (!currentBasket) {
                delete billingData.paymentInformation;

                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }

            var validatedProducts = validationHelpers.validateProducts(currentBasket);
            if (validatedProducts.error) {
                delete billingData.paymentInformation;

                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }
            if (!req.session.privacyCache.get('usingMultiShipping')) {
                COHelpers.copyShippingAddressToShipment(
                    shippingData,
                    currentBasket.defaultShipment
                );

                var giftResult = COHelpers.setGift(
                    currentBasket.defaultShipment,
                    shippingData.isGift,
                    shippingData.giftMessage
                );

                if (giftResult.error) {
                    res.json({
                        error: giftResult.error,
                        fieldErrors: [],
                        serverErrors: [giftResult.errorMessage]
                    });
                    return;
                }
            }

            var billingAddress = currentBasket.billingAddress;
            var billingForm = server.forms.getForm('billing');
            var paymentMethodID = billingData.paymentMethod.value;
            var result;

            billingForm.creditCardFields.cardNumber.htmlValue = '';
            billingForm.creditCardFields.securityCode.htmlValue = '';

            Transaction.wrap(function () {
                if (!billingAddress) {
                    billingAddress = currentBasket.createBillingAddress();
                }

                billingAddress.setFirstName(billingData.address.firstName);
                billingAddress.setLastName(billingData.address.lastName);
                billingAddress.setAddress1(billingData.address.address1);
                billingAddress.setAddress2(billingData.address.address2);
                billingAddress.setCity(billingData.address.city);
                billingAddress.setPostalCode(billingData.address.postalCode);
                if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
                    billingAddress.setStateCode(billingData.address.stateCode);
                }
                billingAddress.setCountryCode(billingData.address.countryCode);

                if (billingData.storedPaymentUUID) {
                    billingAddress.setPhone(req.currentCustomer.profile.phone);
                    currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
                } else {
                    billingAddress.setPhone(billingData.phone);
                    currentBasket.setCustomerEmail(billingData.email);
                }
            });

            // if there is no selected payment option and balance is greater than zero
            if (!paymentMethodID && currentBasket.totalGrossPrice.value > 0) {
                var noPaymentMethod = {};

                noPaymentMethod[billingData.paymentMethod.htmlName] =
                    Resource.msg('error.no.selected.payment.method', 'payment', null);

                delete billingData.paymentInformation;

                res.json({
                    form: billingForm,
                    fieldErrors: [noPaymentMethod],
                    serverErrors: [],
                    error: true
                });
                return;
            }

            // Validate payment instrument
            var creditCardPaymentMethod = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
            var paymentCard = PaymentMgr.getPaymentCard(billingData.paymentInformation.cardType.value);

            var applicablePaymentCards = creditCardPaymentMethod.getApplicablePaymentCards(
                req.currentCustomer.raw,
                req.geolocation.countryCode,
                null
            );

            if (!applicablePaymentCards.contains(paymentCard)) {
                // Invalid Payment Instrument
                var invalidPaymentMethod = Resource.msg('error.payment.not.valid', 'checkout', null);
                delete billingData.paymentInformation;
                res.json({
                    form: billingForm,
                    fieldErrors: [],
                    serverErrors: [invalidPaymentMethod],
                    error: true
                });
                return;
            }

            // check to make sure there is a payment processor
            if (!PaymentMgr.getPaymentMethod(paymentMethodID).paymentProcessor) {
                throw new Error(Resource.msg(
                    'error.payment.processor.missing',
                    'checkout',
                    null
                ));
            }

            var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();

            if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
                result = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(),
                    'Handle',
                    currentBasket,
                    billingData.paymentInformation
                );
            } else {
                result = HookMgr.callHook('app.payment.processor.default', 'Handle');
            }

            // need to invalidate credit card fields
            if (result.error) {
                delete billingData.paymentInformation;

                res.json({
                    form: billingForm,
                    fieldErrors: result.fieldErrors,
                    serverErrors: result.serverErrors,
                    error: true
                });
                return;
            }

            if (HookMgr.hasHook('app.payment.form.processor.' + processor.ID.toLowerCase())) {
                HookMgr.callHook('app.payment.form.processor.' + processor.ID.toLowerCase(),
                    'savePaymentInformation',
                    req,
                    currentBasket,
                    billingData
                );
            } else {
                HookMgr.callHook('app.payment.form.processor.default', 'savePaymentInformation');
            }

            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });

            // Re-calculate the payments.
            var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
                currentBasket
            );

            if (calculatedPaymentTransaction.error) {
                res.json({
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                return;
            }

            var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
            if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
                req.session.privacyCache.set('usingMultiShipping', false);
                usingMultiShipping = false;
            }

            COHelpers.recalculateBasket(currentBasket);

            var currentLocale = Locale.getLocale(req.locale.id);
            var accountModel = new AccountModel(req.currentCustomer);

            var basketModel = new OrderModel(
                currentBasket,
                {
                    usingMultiShipping: usingMultiShipping,
                    shippable: true,
                    countryCode: currentLocale.country,
                    containerView: 'basket'
                }
            );

            var renderedStoredPaymentInstrument = COHelpers.getRenderedPaymentInstruments(
                req,
                accountModel
            );

            delete billingData.paymentInformation;

            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });

            // Re-calculate the payments.
            var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
            if (calculatedPaymentTransactionTotal.error) {
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
                return;
            }

            // Creates a new order.
            var order = COHelpers.createOrder(currentBasket);
            if (!order) {
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
                return next();
            }

            // Handles payment authorization
            var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);
            if (handlePaymentResult.error) {
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
                return next();
            }

            var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
            if (fraudDetectionStatus.status === 'fail') {
                Transaction.wrap(function () {
                    OrderMgr.failOrder(order, true);
                });

                // fraud detection failed
                req.session.privacyCache.set('fraudDetectionStatus', true);

                res.json({
                    error: true,
                    cartError: true,
                    redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });

                return next();
            }

            // Places the order
            var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
            if (placeOrderResult.error) {
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
                return next();
            }

            if (req.currentCustomer.addressBook) {
                // save all used shipping addresses to address book of the logged in customer
                var allAddresses = addressHelpers.gatherShippingAddresses(order);
                allAddresses.forEach(function (address) {
                    if (!addressHelpers.checkIfAddressStored(address, req.currentCustomer.addressBook.addresses)) {
                        addressHelpers.saveAddress(address, req.currentCustomer, addressHelpers.generateAddressName(address));
                    }
                });
            }

            COHelpers.sendConfirmationEmail(order, req.locale.id);

            // Reset usingMultiShip after successful Order placement
            req.session.privacyCache.set('usingMultiShipping', false);

            // TODO: Exposing a direct route to an Order, without at least encoding the orderID
            //  is a serious PII violation.  It enables looking up every customers orders, one at a
            //  time.
            res.json({
                error: false,
                orderID: order.orderNo,
                orderToken: order.orderToken,
                continueUrl: URLUtils.url('Order-Confirm').toString()
            });
            return;
        });

        return next();
    });

module.exports = server.exports();