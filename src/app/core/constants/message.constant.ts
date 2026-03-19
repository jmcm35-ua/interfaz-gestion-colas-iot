export const templateMsg = `{
  "name": "as.up.data.forward",
  "time": "**TIME**",
  "identifiers": [
    {
      "device_ids": {
        "device_id": "ua-pipepressure-s002",
        "application_ids": {
          "application_id": "ua-bim"
        },
        "dev_eui": "**DEV_EUI**",
        "join_eui": "XX",
        "dev_addr": "260BF8F0"
      }
    }
  ],
  "data": {
    "@type": "type.googleapis.com/ttn.lorawan.v3.ApplicationUp",
    "end_device_ids": {
      "device_id": "ua-pipepressure",
      "application_ids": {
        "application_id": "ua-bim"
      },
      "dev_eui": "**DEV_EUI**",
      "join_eui": "XX",
      "dev_addr": "260BF8F0"
    },
    "uplink_message": {
      "session_key_id": "XX",
      "f_port": 85,
      "f_cnt": 71532,
      "frm_payload": "A3sAAA==",
      "decoded_payload": {
        "bytes": [
          3,
          123,
          0,
          0
        ]
      },
      "rx_metadata": [
        {
          "gateway_ids": {
            "gateway_id": "smartua-iot-r01",
            "eui": "3133303726006500"
          },
          "time": "**TIME**",
          "timestamp": **TIME**,
          "rssi": -104,
          "channel_rssi": -104,
          "snr": 6,
          "location": {
            "latitude": 0.0,
            "longitude": 0.0,
            "altitude": 0,
            "source": "SOURCE_REGISTRY"
          },
          "channel_index": 7,
          "received_at": "**TIME**"
        },
        
      ],
      "settings": {
        "data_rate": {
          "lora": {
            "bandwidth": 125000,
            "spreading_factor": 7,
            "coding_rate": "4/5"
          }
        },
        "frequency": "867900000",
        "timestamp": **TIME**,
        "time": "**TIME**"
      },
      "consumed_airtime": "0.051456s",
      "version_ids": {
        "brand_id": "milesight-iot",
        "model_id": "em500-pp",
        "hardware_version": "V1.x",
        "firmware_version": "2.x",
        "band_id": "EU_863_870"
      },
    }
  },
  "correlation_ids": [
    "gs:uplink:01KGPF18SQFKT1P9CAGSHNGWG7"
  ],
  "origin": ".compute.internal",
  "context": {
    "tenant-id": "00000000"
  },
  "visibility": {
    "rights": [
      "RIGHT_APPLICATION_TRAFFIC_READ"
    ]
  },
  "unique_id": "**UNIQUE_ID**"
}`;
