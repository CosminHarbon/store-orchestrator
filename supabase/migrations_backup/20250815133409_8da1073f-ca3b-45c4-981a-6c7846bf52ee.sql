-- Add payment statistics and transaction tracking tables
CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_provider TEXT NOT NULL DEFAULT 'netpopia',
  transaction_id TEXT, -- External payment provider transaction ID
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RON',
  payment_method TEXT, -- card, bank_transfer, etc
  netopia_payment_id TEXT, -- Netopia specific payment ID
  netopia_order_id TEXT, -- Netopia order reference
  provider_response JSONB, -- Store full provider response for debugging
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for payment_transactions
CREATE POLICY "Users can view their own payment transactions" 
ON public.payment_transactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create payment transactions for their orders" 
ON public.payment_transactions 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id AND 
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = payment_transactions.order_id 
    AND orders.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own payment transactions" 
ON public.payment_transactions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_payment_transactions_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add additional Netopia configuration fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS netpopia_signature TEXT,
ADD COLUMN IF NOT EXISTS netpopia_pos_id TEXT,
ADD COLUMN IF NOT EXISTS netpopia_sandbox BOOLEAN DEFAULT true;