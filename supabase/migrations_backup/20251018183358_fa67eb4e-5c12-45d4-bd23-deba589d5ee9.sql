-- Update BARRY WHITE order to current user
UPDATE orders 
SET user_id = 'b67acc37-aced-45ec-a6a4-f1b385aae399'
WHERE customer_name = 'BARRY WHITE' 
AND customer_city = 'Ploiești';