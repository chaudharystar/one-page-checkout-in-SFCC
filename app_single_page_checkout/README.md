#This is one page checkout cartride
##INTRODUCTION
   A one-page checkout is a checkout process where all the steps required to complete a purchase, such as entering shipping information, selecting a payment method, and reviewing the order, occur on a single page. This type of checkout process aims to simplify and speed up the checkout process for customers, which can lead to increased sales. One page checkout typically includes all the necessary form fields such as shipping and billing address, payment details, and order review on a single page. The customer can fill out all the required information, submit the form and complete the purchase without navigating to multiple pages. This is a common feature in e-commerce platforms and can be implemented by customizing the checkout pages and checkout flow of the platform.

##SFRA compatible version:
 This cartridge was created in SFRA version 6.3.0.

##Cartridge Path Considerations:
 The app_single_page_checkout requires the app_storefront_base cartridge. 
 In your cartridge path, include the cartridges in the following order:

 Administration > Sites > Manage Sites > RefArch – Settings
    CartridgeS:app_single_page_checkout:app_storefront_base:modules
##Add cartidge name i.e., app_single_page_checkout in cartrideConfig.json and compile js and scss.
  
#Implement in store pick up

 ##Add  instore.js in checkout folder in client side js and include in checkout.js
   processInclude(require('./checkout/instore'));

 ##Cartridge Path Considerations:
   In your cartridge path, include the cartridges in the following order:
    Administration > Sites > Manage Sites > RefArch – Settings
     CartridgeS:app_single_page_checkout:plugin_instorepickup:app_storefront_base:modules

 ##Add cartidge name i.e., plugin_instorepickup in cartrideConfig.json and compile js and scss.
 



