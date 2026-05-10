export interface User {
  id: string;
  name?: string;
  username: string;
  url?: string;
  email?: string;
  role?: string;
  createdAt?: Date;
}

export interface LoginCredentials {
  url: string;
  username: string;
  password: string;
}

export interface AuthSession {
  apiKey: string;
  userId: string;
  clientUrl: string;
  user: User;
  cookies?: string;
}

export interface BusinessDetails {
  id: number;
  name: string;
  account_type: string;
  currency_id: number;
  business_logo?: string | null;
  dateExpiry?: string | null;
  phone_numbers: string[];
  contact_details?: string | null;
  company_name?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  apiUrl: string;
  userId: string;
}

export interface CurrencyDetails {
  id: number;
  name: string;
  full_name?: string | null;
  symbol?: string | null;
}
