package config

import "testing"

func TestValidateProxies(t *testing.T) {
	cases := map[string]bool{
		"127.0.0.1/32,::1/128": true, "10.0.0.0/8": true, "172.18.0.5": true,
		"0.0.0.0/0": false, "::/0": false, "no-es-ip": false, "10.0.0.0/99": false,
	}
	for in, ok := range cases {
		c := &Config{TrustedProxies: splitCSV(in)}
		if err := c.validateProxies(); (err == nil) != ok {
			t.Errorf("%q: ok=%v, err=%v", in, ok, err)
		}
	}
}
